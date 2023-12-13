'use strict';
const fs = require('fs');
const smpp = require('smpp');
const yargs = require('yargs');
const crypto = require('crypto');
const argv = yargs
    .option('local-address', {
        alias: 'l',
        desc: 'Specify the address used to connect to the RE',
        type: 'string',
        default: '172.19.2.1'
    })
    .option('smsc-address', {
        alias: 's',
        desc: 'Specify the address of the SMSC',
        type: 'string',
        default: '172.19.2.200'
    })
    .option('smsc-port', {
        alias: 'p',
        desc: 'Specify the port of the SMSC',
        type: 'number',
        default: 2775
    })
    .option('system-id', {
        alias: 'u',
        desc: 'Specify the System ID',
        type: 'string'
    })
    .option('password', {
        alias: 'w',
        desc: 'Specify the Password',
        type: 'string'
    })
    .option('message', {
        alias: 'm',
        desc: 'Specify the message to be sent',
        type: 'string',
        array: true
    })
    .option('smoke', {
        alias: 'z',
        desc: 'Continue to send messages as number sequence. Ignore --message',
        type: 'boolean',
        default: false
    })
    .option('interval', {
        alias: 'i',
        desc: 'Specify the interval between each message in milliseconds',
        type: 'number',
        default: 1000
    })
    .option('originator-address', {
        alias: 'o',
        desc: 'Specify the source_addr in submit_sm',
        type: 'string',
        default: 'me'
    })
    .option('recipient-address', {
        alias: 'r',
        desc: 'Specify the destination_addr in submit_sm',
        type: 'string',
        array: true,
        default: ['you']
    })
    .option('start-sequence', {
        alias: 'q',
        desc: 'Specify the starting sequence_number used by this ESME',
        type: 'number',
        default: 1
    })
    .option('loop', {
        alias: 'L',
        desc: 'Repeat the sequence of the messages',
        type: 'boolean',
        default: false
    })
    .option('loops', {
        alias: 'n',
        desc: 'Repeat the sequence of the messages n times. Default is no repeat',
        type: 'number'
    })
    .option('enquire-link', {
        alias: 'e',
        desc: 'Specify the interval between each enquire_link in milliseconds. Default is no enquire_link',
        type: 'number'
    })
    .option('response-delay', {
        alias: 'd',
        desc: 'Specify a delay in milliseconds for response message (deliver_sm_resp)',
        type: 'number'
    })
    .option('keepalive', {
        alias: 'k',
        desc: 'Do not send unbind after finish sending all messages',
        type: 'boolean',
        default: false
    })
    .option('message-identifier', {
        alias: 'y',
        desc: 'Specify the message-identifier to be used in case of multi-part message. A non-numeric value means it is randomised per sending on the set of the SMPP messages of the multipart message. If not specified, the message-identifier is fixed and calculated based on the multipart message itself',
        type: 'string'
    })
    .option('multipart-file', {
        alias: 'f',
        desc: 'Specify a file containing the multipart messages. The size of the text file should be larger than 254 bytes',
        type: 'string',
        array: true
    })
    .option('multipart-parts', {
        alias: 'x',
        desc: 'Specify the parts of the multipart messages to be sent for this particular client',
        type: 'number',
        array: true
    })
    .option('connections', {
        alias: 'c',
        desc: 'Specify the number of connections to start with. Default is only using one connection',
        type: 'number',
        default: 1
    })
    .help()
    .argv;
argv.smoke || argv.message || console.log('At least 1 message should be provided') || process.exit(1);
if ( argv.message && argv.message.some((m) => m.trim() === '') ) {
    console.log('Message cannot be empty string');
    process.exit(1);
}
const sequenceGenerator = function*() {
    let c_seq = argv.startSequence;
    while ( true ) {
        yield c_seq;
        c_seq++;
    }
    return c_seq;
}();
const msg_bind = {
    sequence_number: sequenceGenerator.next().value,
    system_id: argv.systemId,
    password: argv.password
};
const datestr = () => {
    //return new Date().toLocaleString('ja', { dateStyle: 'medium', timeStyle: 'medium' }) + ' ';
    return new Date().toLocaleString('en-gb', { timeStyle: 'medium' }) + ' ';
};
const generateMessageId = (input) => crypto.createHash('sha256').update(input).digest('hex').slice(0, 40);
const messageExtract = (input) => input.toString().length <= 40 ? input.toString() : `${input.toString().slice(0, 25)} .. ${input.toString().slice(-11)}`;
let currentLoop = 0;
const session = smpp.connect({
    localAddress: argv.localAddress,
    url: `smpp://${argv.smscAddress}:${argv.smscPort}`,
    //auto_enquire_link_period: 5000
});
if ( argv.multipartFile && argv.multipartFile.length > 0 ) {
}
console.log(`${'='.repeat(5)} Settings ${'='.repeat(65)}`);
argv.multipartParts && argv.multipartParts.length > 0 && argv.multipartParts.sort((a, b) => a - b) && console.log(`only sending multiparts ${argv.multipartParts.reduce((p, c, i) => i == 0 ? c : i == argv.multipartParts.length - 1 ? `${p} and ${c}` : `${p}, ${c}`, '')}`);
argv.messageIdentifier && !isNaN(parseInt(argv.messageIdentifier)) && console.log(`using message-identifer ${parseInt(argv.messageIdentifier) & 0xff}(${new Number(parseInt(argv.messageIdentifier) & 0xff).toString(16)})`);
console.log('='.repeat(80));
console.log(`${datestr()}<-[${msg_bind.sequence_number}]:bind_transceiver system_id <${argv.systemId}>`);
session.bind_transceiver(msg_bind, function(bind_resp) {
    if ( bind_resp.command_status == 0 ) {
        console.log(`${datestr()}->[${bind_resp.sequence_number}]:bind_transceiver successful`);
        let stopping = false;
        if ( argv.enquireLink ) {
            setInterval(() => {
                const msg_enquire_link = { sequence_number: sequenceGenerator.next().value };
                console.log(`${datestr()}<-[${msg_enquire_link.sequence_number}]:enquire_link`);
                session.enquire_link(msg_enquire_link, (pdu_resp) => {
                    console.log(`${datestr()}->[${pdu_resp.sequence_number}]:enquire_link_resp status <${pdu_resp.command_status}>`);
                });
            }, argv.enquireLink);
        }
        process.on('SIGINT', () => {
            console.log('Control-C');
            if ( stopping ) {
                console.error('Forcibly exit');
                process.exit(1);
            }
            stopping = true;
            const msg_unbind = { sequence_number: sequenceGenerator.next().value };
            console.log(`${datestr()}<-[${msg_unbind.sequence_number}]:unbind`);
            session.unbind(msg_unbind, (pdu_resp) => {
                if ( pdu_resp.command_status == 0 ) {
                    console.log(`${datestr()}->[${pdu_resp.sequence_number}]:unbind_resp successful`);
                    setTimeout(() => {
                        process.exit(0);
                    }, 100);
                } else {
                    console.log(`${datestr()}->[${pdu_resp.sequence_number}]:unbind_resp command_status <${pdu_resp.command_status}>`);
                    setTimeout(() => {
                        process.exit(1);
                    }, 100);
                }
            });
        });
        const messages = [];
        if ( !argv.smoke ) {
            // flatten the messages first
            for ( let i = 0; i < argv.message.length; i++ ) {
                //const recipientAddress = argv.recipientAddress[Math.floor(Math.random() * argv.recipientAddress.length)];
                let messageContent = argv.message[i];
                if ( argv.message[i].charAt(0) == '@' ) {
                    messageContent = fs.readFileSync(argv.message[i].slice(1), { "encoding": "utf-8" });
                }
                if ( messageContent.length > 254 ) {
                    let chunk = messageContent.match(/(.{1,248})/g);
                    //const messageIdentifier = Math.floor(Math.random() * 256);
                    const localMessageIdentifier = parseInt(crypto.createHash('sha256').update(messageContent).digest('hex').slice(-2), 16);
                    const multipart = [];
                    for ( let ii = 0; ii < chunk.length; ii++ ) {
                        if ( argv.multipartParts && argv.multipartParts.length > 0 && !argv.multipartParts.includes(ii + 1) ) continue;
                        multipart.push({
                            source_addr: argv.originatorAddress,
                            //destination_addr: recipientAddress,
                            data_coding: 0x01,
                            esm_class: 0x40,
                            short_message: Buffer.concat([Buffer.from([0x05, 0x00, 0x03, localMessageIdentifier, chunk.length, ii + 1]), Buffer.from(chunk[ii])])
                        });
                    }
                    multipart.length > 0 && messages.push(multipart);
                } else {
                    messages.push({
                        source_addr: argv.originatorAddress,
                        //destination_addr: argv.recipientAddress[0],
                        short_message: messageContent
                    });
                }
            }
        }
        setTimeout(() => {
            let loop = messages.length;
            const looper = async () => {
                if ( stopping ) return;
                if ( argv.smoke ) {
                    const smoker = sequenceGenerator.next().value;
                    console.log(`${datestr()}<-[${smoker}]:submit_sm <smoke:${smoker}>`);
                    session.submit_sm({
                        sequence_number: smoker,
                        source_addr: argv.originatorAddress,
                        destination_addr: argv.recipientAddress[Math.floor(Math.random() * argv.recipientAddress.length)],
                        short_message: `smoke:${smoker}`
                    }, (pdu_resp) => {
                        if ( pdu_resp.command_status == 0 ) {
                            console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp message_id <${pdu_resp.message_id}>`);
                        } else {
                            console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp command_status <${pdu_resp.command_status}>`);
                            stopping = true;
                        }
                    });
                } else {
                    const m = messages[messages.length - loop];
                    if ( m instanceof Array ) {
                        // multipart messages; send them in a batch
                        const r = argv.recipientAddress[Math.floor(Math.random() * argv.recipientAddress.length)];
                        let mid;
                        if ( argv.messageIdentifier ) {
                            if ( isNaN(parseInt(argv.messageIdentifier)) ) {
                                // messageIdentifier is randomised each time
                                mid = Math.floor(Math.random() * 256);
                            } else {
                                mid = parseInt(argv.messageIdentifier) & 0xff;
                            }
                        }
                        for ( const mm in m ) {
                            m[mm]['sequence_number'] = sequenceGenerator.next().value;
                            m[mm]['destination_addr'] = r;
                            if ( mid !== undefined ) {
                                m[mm]['short_message'][3] = mid;
                            }
                            const msg = m[mm].esm_class === undefined ? m[mm].short_message : m[mm].short_message.slice(6).toString();
                            console.log(`${datestr()}<-[${m[mm].sequence_number}]:submit_sm (${msg.length})<${msg}> to <${r}> with identifier <${m[mm].short_message[3].toString()}>`);
                            await session.submit_sm(m[mm], (pdu_resp) => {
                                if ( pdu_resp.message_id != generateMessageId(msg) ) {
                                    console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp INCORRECT message_id <${pdu_resp.message_id}>; should be <${generateMessageId(msg)}>`);
                                } else {
                                    if ( pdu_resp.command_status == 0 ) {
                                        console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp message_id <${pdu_resp.message_id}>`);
                                    } else {
                                        console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp command_status <${pdu_resp.command_status}>`);
                                    }
                                }
                            });
                        }
                    } else {
                        m['sequence_number'] = sequenceGenerator.next().value;
                        m['destination_addr'] = argv.recipientAddress[Math.floor(Math.random() * argv.recipientAddress.length)];
                        const msg = m.esm_class === undefined ? m.short_message : m.short_message.slice(6).toString();
                        console.log(`${datestr()}<-[${m.sequence_number}]:submit_sm (${msg.length})<${msg}>`);
                        session.submit_sm(m, (pdu_resp) => {
                            if ( pdu_resp.message_id != generateMessageId(m.short_message.toString()) ) {
                                console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp INCORRECT message_id <${pdu_resp.message_id}>; should be <${generateMessageId(m[mm].short_message.slice(6).toString())}>`);
                            } else {
                                if ( pdu_resp.command_status == 0 ) {
                                    console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp message_id <${pdu_resp.message_id}>`);
                                } else {
                                    console.log(`${datestr()}->[${pdu_resp.sequence_number}]:submit_sm_resp command_status <${pdu_resp.command_status}>`);
                                }
                            }
                        });
                    }
                    if ( --loop === 0 ) {
                        if ( argv.loop || argv.loops && ++currentLoop < argv.loops ) {
                            loop = messages.length;
                        } else {
                            if ( !argv.keepalive ) {
                                setTimeout(async () => {
                                    const msg_unbind = { sequence_number: sequenceGenerator.next().value };
                                    console.log(`${datestr()}<-[${msg_unbind.sequence_number}]:unbind`);
                                    await session.unbind(msg_unbind, (pdu_resp) => {
                                        if ( pdu_resp.command_status == 0 ) {
                                            console.log(`${datestr()}->[${pdu_resp.sequence_number}]:unbind_resp successful`);
                                            process.exit(0);
                                        } else {
                                            console.log(`${datestr()}->[${pdu_resp.sequence_number}]:unbind_resp command_status <${pdu_resp.command_status}>`);
                                            process.exit(1);
                                        }
                                    });
                                }, 1000);
                            }
                            return;
                        }
                    }
                }
                setTimeout(looper, argv.interval);
            };
            looper();
        }, argv.interval);
    } else {
        console.log(`${datestr()}->[${bind_resp.sequence_number}]:bind_transceiver status <${bind_resp.command_status}>`);
        session.close();
    }
});
session.on('deliver_sm', function(pdu) {
    console.log(`${datestr()}->[${pdu.sequence_number}]:deliver_sm message (${pdu.short_message.message.toString().length})<${pdu.short_message.message.toString()}>`);
    if ( argv.responseDelay ) {
        const randomDelay = Math.floor(argv.responseDelay * Math.random());
        console.log(`${datestr()}->[${pdu.sequence_number}]:delaying the response for ${randomDelay}`);
        setTimeout(() => {
            session.send(pdu.response());
            console.log(`${datestr()}<-[${pdu.sequence_number}]:deliver_sm_resp`);
        }, randomDelay);
    } else {
        session.send(pdu.response());
        console.log(`${datestr()}<-[${pdu.sequence_number}]:deliver_sm_resp`);
    }
});
