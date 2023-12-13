'use strict';
const smpp = require('smpp');
const yargs = require('yargs');
const crypto = require('crypto');
const argv = yargs
    .option('listener', {
        alias: 'l',
        desc: 'Specify listening address',
        type: 'string',
        default: '172.19.3.1'
    })
    .option('port', {
        alias: 'p',
        desc: 'Specify listening port',
        type: 'number',
        default: 2775
    })
    .option('start-sequence', {
        alias: 'q',
        desc: 'Specify the starting sequence_number used by this SMSC for server-init request (deliver_sm)',
        type: 'number',
        default: 1
    })
    .option('system-id', {
        alias: 'a',
        desc: 'Specify the system-id:password to be added as a valid account. Overrides default accounts',
        type: 'string',
        array: true
    })
    .option('keepalive', {
        alias: 'k',
        type: 'boolean',
        default: false
    })
    .option('interval', {
        desc: 'Specify the interval between each CCR in milliseconds',
        type: 'number',
        default: 10
    })
    .option('bind-delay', {
        desc: 'Specify a bind delay in milliseconds',
        type: 'number',
        default: 1
    })
    .option('log-multipart', {
        alias: 'M',
        desc: 'Log only submit_sm messages of multipart',
        type: 'boolean',
        default: false
    })
    .help()
    .argv;
//const generateMessageId = (input) => crypto.createHash('sha256').update(input).digest('hex');
const generateMessageId = (input) => crypto.createHash('sha256').update(input).digest('hex').slice(0, 40);
const messageExtract = (input) => input.toString().length <= 40 ? input.toString() : `${input.toString().slice(0, 25)} .. ${input.toString().slice(-11)}`;
const tzoffset = (new Date()).getTimezoneOffset() * 60000;
const sessions = new Map();
const systemIds = new Map();
argv.systemId && argv.systemId.forEach((e) => systemIds.set(e.split(':')[0], e.split(':')[1]));
if ( systemIds.size == 0 ) {
    // add some default accounts
    systemIds.set('kit', 'kitkit');
    systemIds.set('kit1', 'abcd1234');
    systemIds.set('kit2', 'xyz123');
}
let s_seq = argv.startSequence - 1;
const checkAsyncUserPass = (s, p, callback) => {
    if ( systemIds.has(s) && systemIds.get(s) === p ) {
        callback();
    } else {
        callback('Invalid system-id/password');
    }
};
const datestr = () => {
    //return new Date().toLocaleString('ja', { dateStyle: 'medium', timeStyle: 'medium' }) + ' ';
    return new Date().toLocaleString('en-gb', { timeStyle: 'medium' }) + ' ';
};
const smsc = smpp.createServer((session) => {
    const sss = new Set();
    session.on('bind_transceiver', (pdu) => {
        let from = `${session.socket.remoteAddress}:${session.socket.remotePort}`;
        console.log(`${datestr()}->[${pdu.sequence_number}]${from}|bind_transceiver system id <${pdu.system_id}> password <${pdu.password}>`);
        session.pause();
        checkAsyncUserPass(pdu.system_id, pdu.password, (err) => {
            sessions.set(from, `${from}:${pdu.system_id}`);
            setTimeout(() => {
                if ( err ) {
                    console.log(`${datestr()}<-[${pdu.sequence_number}]${from}|bind_transceiver_resp ESME_RBINDFAIL`);
                    session.send(pdu.response({ command_status: smpp.ESME_RBINDFAIL }));
                    session.close();
                } else {
                    console.log(`${datestr()}<-[${pdu.sequence_number}]${from}|bind_transceiver_resp`);
                    session.send(pdu.response());
                    session.resume();
                }
            }, argv.bindDelay);
        });
    });
    let smokers = undefined;
    session.on('submit_sm', (pdu) => {
        console.log(`${datestr()}->[${pdu.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|submit_sm (${pdu.short_message.message.toString().length})<${messageExtract(pdu.short_message.message.toString())}>`);
        const messageId = generateMessageId(pdu.short_message.message.toString());
        let msg_submit_sm_resp = pdu.response({ message_id: messageId });
        if ( pdu.short_message.message.toString().startsWith('smoke:') ) {
            if ( smokers === undefined ) {
                smokers = pdu.short_message.message.toString().split(':')[1] * 1;
            } else if ( pdu.short_message.message.toString().split(':')[1] * 1 != smokers + 1 ) {
                console.log(`${datestr()}======> smoke message <${pdu.short_message.message.toString()}> received; it should be <smoke:${smokers + 1}> <======`);
                //msg_submit_sm_resp = pdu.response({
                //    command_status: smpp.ESME_RINVNUMMSGS,
                //    message_id: messageId
                //});
                msg_submit_sm_resp.command_status = smpp.ESME_RINVNUMMSGS;
            } else {
                smokers++;
            }
        }
        session.send(msg_submit_sm_resp);
        console.log(`${datestr()}<-[${pdu.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|submit_sm_resp message_id <${messageId}>`);
        if ( pdu.short_message.message.toString().startsWith('delivery_receipt:') ) {
            setTimeout(() => {
                const deliver_sm_short_message = `id:${messageId} sub:001 dlvrd:001 submit date:${(new Date(Date.now() - tzoffset)).toISOString().split('.')[0].replace(/[^0-9]/g, '')} done date:${(new Date(Date.now() - tzoffset + 5000)).toISOString().split('.')[0].replace(/[^0-9]/g, '')} stat:DELIVRD err:000 text:something something`;
                sss.add(++s_seq);
                console.log(`${datestr()}<-[${s_seq}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|deliver_sm <${messageExtract(deliver_sm_short_message)}>`);
                session.deliver_sm({
                    sequence_number: s_seq,
                    short_message: deliver_sm_short_message
                }, (pdu_resp) => {
                    sss.delete(pdu_resp.sequence_number);
                    if ( pdu_resp.command_status == 0 ) {
                        console.log(`${datestr()}->[${pdu_resp.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|deliver_sm_resp`);
                    } else {
                        console.log(`${datestr()}->[${pdu_resp.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|deliver_sm_resp command_status <${pdu_resp.command_status}>`);
                    }
                });
            }, pdu.short_message.message.toString().split(':')[1] * 1);
        }
    });
    session.on('unbind', (pdu) => {
        console.log(`${datestr()}->[${pdu.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|unbind`);
        session.send(pdu.response());
        console.log(sss);
        console.log(`${datestr()}<-[${pdu.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|unbind_resp`);
        //session.close();
    });
    session.on('enquire_link', (pdu) => {
        console.log(`${datestr()}->[${pdu.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|enquire_link`);
        session.send(pdu.response());
        console.log(`${datestr()}->[${pdu.sequence_number}]${sessions.get(`${session.socket.remoteAddress}:${session.socket.remotePort}`)}|enquire_link_resp`);
    });
    session.on('error', (e) => {
        console.log(e);
    });
});
smsc.listen(argv.port, argv.listener).on('listening', () => {
    console.log(`SMSC listening SMPP on ${JSON.stringify(smsc.address())}`);
});
