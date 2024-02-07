'use strict';

const diameter = require('diameter');
const yargs = require('yargs');
const crypto = require('crypto');

const argv = yargs
    .option('local-address', {
        alias: 'l',
        desc: 'Specify the address used to connect to the DRA',
        type: 'string',
        default: '172.19.2.1'
    })
    .option('dra-address', {
        alias: 's',
        desc: 'Specify the address of the DRA',
        type: 'string',
        default: '172.19.2.222'
    })
    .option('dra-port', {
        alias: 'p',
        desc: 'Specify the port of the DRA',
        type: 'number',
        default: 3868
    })
    .option('e164', {
        alias: 'e',
        desc: 'Specify the MSISDN number',
        type: 'string',
        array: true,
        default: ['85255610347']
    })
    .option('e164-start', {
        desc: 'Specify the starting MSISDN number as an 11-digit number. Both --e164-start and --e164-end must be specified for this to work',
        type: 'string'
    })
    .option('e164-end', {
        desc: 'Specify the ending MSISDN number as an 11-digit number. Both --e164-start and --e164-end must be specified for this to work',
        type: 'string'
    })
    .option('imsi', {
        alias: 'i',
        desc: 'Specify the IMSI number',
        type: 'string',
        default: '123456789012345'
    })
    .option('ueip', {
        desc: 'Specify the IP address used for Framed-IP-Address AVP in CCR-i',
        type: 'string'
    })
    .option('origin-realm', {
        alias: 'r',
        desc: 'Specify Origin-Realm for this PGW',
        type: 'string',
        default: 'kit.com'
    })
    .option('origin-host', {
        alias: 'h',
        desc: 'Specify Origin-Host for this PGW',
        type: 'string'
    })
    .option('destination-realm', {
        alias: 'R',
        desc: 'Specify Destination-Realm to send to',
        type: 'string'
    })
    .option('destination-host', {
        alias: 'H',
        desc: 'Specify Destination-Host to send to',
        type: 'string'
    })
    .option('peer-origin-realm', {
        desc: 'Specify Origin-Realm to be used for peer messages (CER/CEA, DWR/DWA, DPR/DPA, etc). Default to be the same as the "--origin-realm" option',
        type: 'string'
    })
    .option('peer-origin-host', {
        desc: 'Specify Origin-Host to be used for peer messages (CER/CEA, DWR/DWA, DPR/DPA, etc). Default to be the same as the "--origin-host" option',
        type: 'string'
    })
    .option('peer-destination-realm', {
        desc: 'Specify Destination-Realm to be expected for peer messages (CER/CEA, DWR/DWA, DPR/DPA, etc). Default to be the same as the "--destination-realm" option',
        type: 'string'
    })
    .option('peer-destination-host', {
        desc: 'Specify Destination-Host to be expected for peer messages (CER/CEA, DWR/DWA, DPR/DPA, etc). Default to be the same as the "--destination-host" option',
        type: 'string'
    })
    .option('device-watchdog-interval', {
        alias: 'w',
        desc: 'Send a Device-Watchdog request every n milliseconds',
        type: 'number'
    })
    .option('update', {
        desc: 'Send a total of n CCR-u before sending the CCR-t',
        type: 'number',
        default: 10
    })
    .option('update-interval', {
        desc: 'Send a CCR-u every n milliseconds',
        type: 'number',
        default: 10
    })
    .option('DPR', {
        desc: 'Send Disconnect-Peer in n milliseconds after receiving CCA-t',
        type: 'number'
    })
    .option('STR', {
        desc: 'Send Session-Termination in n milliseconds after receiving CCA-t',
        type: 'number'
    })
    .option('debug-level', {
        alias: 'v',
        desc: 'Specify how messages are logged - 1 = session/host/realm only, 2 = full',
        type: 'number',
        default: 1,
        choices: [1, 2]
    })
    .option('skip-log-command', {
        array: true,
        desc: 'Specify which command(s) are not logged. Commands are specified as code (Capabilities-Exchange = 257, Device-Watchdog = 280, etc)',
        type: 'number'
    })
    .option('skip-log-application', {
        array: true,
        desc: 'Specify which application(s) are not logged. Applications are specified as id (Diameter Common Messages = 0, Diameter Credit Control Application = 4, etc)',
        type: 'number'
    })
    .option('retransmit-timeout', {
        desc: 'When specify (non-zero), send the request again with "Potentially Re-tranmitted" flag after n milliseconds if an answer is not received',
        type: 'number'
    })
    .option('max-retransmit', {
        desc: 'Specify the maximum number of times that the same request will be retransmitted',
        type: 'number',
        default: 1
    })
    .help()
    .argv;

const findValue = (a, k) => {
    let o = a.find((avp) => { return avp[0] === k; });
    return o ? o[1] : undefined;
};
const findIndex = (a, k) => {
    //let i = a.findIndex((avp) => { return avp[0] === k; });
    //return o ? o[1] : undefined;
    return a.findIndex((avp) => { return avp[0] === k; });
};

const IMPORTANT_AVPS = [
    'session-id',
    '-host',
    '-realm',
    'result-code',
    'cc-request-'
];

const f0 = new Intl.DateTimeFormat('ja', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const debugLog = (m) => {
    //console.log(JSON.stringify(m));
    if ( argv.skipLogApplication && argv.skipLogApplication.includes(m.header.applicationId) || argv.skipLogCommand && argv.skipLogCommand.includes(m.header.commandCode) ) {
        return;
    }
    const dirChar = m.hasOwnProperty('_timeReceived') ? '->[]' : '<-[]';
    if ( argv.debugLevel == 2 ) {
        console.log(`${dirChar} +${'-'.repeat(21)}+`);
        //console.log(`${dirChar} | ${new Date().toLocaleString('ja', { dateStyle: 'medium', timeStyle: 'medium' })} |`);
        console.log(`${dirChar} | ${f0.format(new Date())} |`);
        console.log(`${dirChar} +${'-'.repeat(21)}+`);
        diameter.logMessage(m);
    } else {
        console.log(`${dirChar} +${'-'.repeat(67)}`);
        //console.log(`${dirChar} ${['|', new Date().toLocaleString('ja', { dateStyle: 'medium', timeStyle: 'medium' }), m.command + (m.header.flags.request ? '-Request' : '-Answer'), m.header.flags.error ? '(!)' : ''].join(' ')}`);
        console.log(`${dirChar} ${['|', f0.format(new Date()), m.command + (m.header.flags.request ? '-Request' : '-Answer'), m.header.flags.error ? '(!)' : '', m.header.flags.potentiallyRetransmitted ? '(T)' : ''].join(' ')}`);
        console.log(`${dirChar} +${'-'.repeat(67)}`);
        for ( let i = 0; i < m.body.length; i++ ) {
            if ( IMPORTANT_AVPS.some((s) => m.body[i][0].toLowerCase().includes(s)) ) {
                console.log(`${dirChar} | ${m.body[i].join(': ')}`);
            }
        }
        console.log(`${dirChar} +${'-'.repeat(67)}`);
    }
};

const originRealm = argv.originRealm;
const originHost = argv.originHost ? (argv.originHost.endsWith(originRealm) ? argv.originHost : argv.originHost + '.' + originRealm) : 'pgw-' + (Math.random() * Number.MAX_SAFE_INTEGER).toString(36).replace(/[^a-zA-Z0-9]+/g, '').substr(0, 6) + '.' + originRealm;

const peerOriginRealm = argv.peerOriginRealm || originRealm;
const peerOriginHost = argv.peerOriginHost || originHost;
const peerDestinationRealm = argv.peerDestinationRealm || argv.destinationRealm;
const peerDestinationHost = argv.peerDestinationHost || argv.destinationHost;

const sessionIdGenerator = () => {
    let high32bit = new Date().toISOString().replace(/[^0-9]/g, '').substring(0, 14);
    let low32bit = 1;
    //return (host = originHost) => [host, high32bit, low32bit++, new Date().getTime()].join(';');
    return (host = originHost) => [host, high32bit, low32bit++, Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)].join(';');
};
const sessionId = sessionIdGenerator();
const peeringSessionId = sessionId(peerOriginHost);

const clientOptions = {
    timeout: argv.retransmitTimeout || 14000,
    beforeAnyMessage: debugLog,
    afterAnyMessage: debugLog,
    localAddress: argv.localAddress,
    host: argv.draAddress,
    port: argv.draPort
};

const createSession = (e164) => {
    //console.log(String(BigInt(parseInt(crypto.createHash('sha1').update(e164).digest('hex'), 16))).substring(0, 12));
    return {
        'e164': e164,
        //'imsi': '4549900' + e164.slice(-8),
        'imsi': `454${String(BigInt(parseInt(crypto.createHash('sha1').update(e164).digest('hex'), 16))).substring(0, 12)}`,
        //'sid': sessionIdGenerator() + ';' + e164,
        'sid': sessionId() + ';' + e164,
        'ueip': (argv.ueip && net.isIP(argv.ueip)) ? new Uint8Array(argv.ueip.match(/^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/).slice(1, 5).map(o=>+o)) : new Uint8Array([1 + Math.floor(Math.random() * 253), Math.floor(Math.random() * 255), Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)]),
        'ccrn': undefined,
        'ccriTimestamp': undefined,
        'ccrtTimestamp': undefined
    };
};
const sessions = [];
argv.e164 && argv.e164.forEach((e) => sessions.push(createSession(e)));
if ( argv.e164Start && argv.e164End ) {
    const start = /^\d{11}$/.test(argv.e164Start) ? parseInt(argv.e164Start, 10) : -1;
    const end = /^\d{11}$/.test(argv.e164End) ? parseInt(argv.e164End, 10) : -1;
    if ( start < 0 || end < 0 || start > end ) {
        yargs.showHelp();
        process.exit(1);
    }
    [...Array(end - start + 1).keys()].forEach((i) => sessions.push(createSession(String(start + i))));
}
if ( sessions.length == 0 ) {
    console.error('Must specify at least one MSISDN');
    process.exit(1);
} else {
    console.log(sessions);
}

const sessionsTime = {};
let stopping = false;

const sendDPR = (conn) => {
    const dpr = conn.createRequest('Diameter Common Messages', 'Disconnect-Peer', peeringSessionId);
    dpr.body = dpr.body.concat([
        ['Origin-Host', peerOriginHost],
        ['Origin-Realm', peerOriginRealm],
        ['Disconnect-Cause', 'DO_NOT_WANT_TO_TALK_TO_YOU']
    ]);
    conn.sendRequest(dpr).then((dpa) => {
    }, (dpe) => {
        console.log(`Error sending DPR: ${dpe}`);
    }).finally(() => {
        conn.end();
        process.exit();
    });
};

const doDWR = (conn) => {
    const dwr = conn.createRequest('Diameter Common Messages', 'Device-Watchdog', peeringSessionId);
    dwr.body = dwr.body.concat([
        ['Origin-Host', peerOriginHost],
        ['Origin-Realm', peerOriginRealm]
    ]);
    conn.sendRequest(dwr).then((dwa) => {
    }, (dwe) => {
        console.log(`Error sending DWR: ${dwe}`);
        //sendDPR(conn);
    });
};

const sendCCRi = (conn, ccri) => {
    return new Promise((resolve, reject) => {
        conn.sendRequest(ccri).then((ccai) => {
            //let ccRequestNumber = 1;
            //setTimeout(sendCCRu, 1000, conn, sid, 1);
            resolve();
        }, (ccei) => {
            console.log(`Error sending CCR-i: ${ccei}`);
            // retransmit logic in the case of timeout
            if ( ccei.name === 'TimeoutError' && ccri.retransmission++ < argv.maxRetransmit ) {
                console.log(`Timeout, doing retransmission #${ccri.retransmission}`);
                ccri.header.flags.potentiallyRetransmitted = true;
                sendCCRi(conn, ccri);
            } else {
                //sendDPR(conn);
                reject();
            }
        });
    });
};

const doCCRi = (conn, sess) => {
    const ccriEventTimestamp = Math.trunc(new Date().getTime() / 1000) + 2208988800;
    sess.ccrn = 0;
    sess.ccriTimestamp = ccriEventTimestamp;
    const ccri = conn.createRequest('Diameter Credit Control Application', 'Credit-Control', sess.sid);
    ccri.header.flags.proxiable = true;
    ccri.body = ccri.body.concat([
        ['Auth-Application-Id', 'Diameter Credit Control Application'],
        ['Origin-Host', originHost],
        ['Origin-Realm', originRealm]
    ]);
    if ( argv.destinationHost ) {
        ccri.body = ccri.body.concat([
            ['Destination-Host', argv.destinationHost]
        ]);
    }
    if ( argv.destinationRealm ) {
        ccri.body = ccri.body.concat([
            ['Destination-Realm', argv.destinationRealm]
        ]);
    }
    ccri.body = ccri.body.concat([
        ['Service-Context-Id', 'pgw@3gppnetwork.org'],
        ['CC-Request-Type', 'INITIAL_REQUEST'],
        ['CC-Request-Number', 0],
        ['User-Name', 'sirobit'],
        ['Origin-State-Id', 123456],
        ['Event-Timestamp', ccriEventTimestamp],
        ['Subscription-Id', [
            ['Subscription-Id-Type', 'END_USER_E164'],
            ['Subscription-Id-Data', sess.e164]
        ]],
        ['Subscription-Id', [
            ['Subscription-Id-Type', 'END_USER_IMSI'],
            ['Subscription-Id-Data', sess.imsi]
        ]],
        ['Multiple-Services-Indicator', 'MULTIPLE_SERVICES_SUPPORTED'],
        ['Multiple-Services-Credit-Control', [
            ['Requested-Service-Unit', 0],
            ['Rating-Group', 1],
            ['Service-Identifier', 1]
        ]],
        ['User-Equipment-Info', [
            ['User-Equipment-Info-Type', 'IMEISV'],
            ['User-Equipment-Info-Value', new Uint8Array([0x40, 0x12, 0x88, 0x88, 0x88, 0x88, 0x18, 0x81])]
        ]],
        ['Service-Information', [
            ['PS-Information', [
                ['3GPP-Charging-Id', new Uint8Array([0x0f, 0x65, 0x16, 0x1f])],
                ['3GPP-PDP-Type', 'IPv4'],
                ['PDP-Address', '10.83.97.101'],
                ['3GPP-GPRS-Negotiated-QoS-Profile', '08-7408000249f0000f4240'],
                ['SGSN-Address', '203.145.68.61'],
                ['GGSN-Address', '203.145.68.67'],
                ['CG-Address', '10.65.51.1'],
                ['3GPP-IMSI-MCC-MNC', '45403'],
                ['3GPP-GGSN-MCC-MNC', '45403'],
                ['3GPP-NSAPI', '5'],
                ['Called-Station-Id', 'pgw.test.com'],
                ['3GPP-Selection-Mode', '0'],
                ['3GPP-Charging-Characteristics', '0800'],
                ['3GPP-SGSN-MCC-MNC', '45403'],
//                    ['3GPP-User-Location-Info', 'MCC 454 Hong Kong    , China, MNC 03 Hutchison Telephone Company Ltd, ECGI 0x92ff403'],
                ['3GPP-User-Location-Info', new Uint8Array([0x82, 0x54, 0xf4, 0x30, 0x08, 0x48, 0x54, 0xf4, 0x30, 0x09, 0x2f, 0xf4, 0x03])],
//                    ['3GPP-MS-TimeZone', '+8'],
                ['3GPP-MS-TimeZone', new Uint8Array([0x23, 0x00])],
//                    ['3GPP-RAT-Type', '06'],
                ['3GPP-RAT-Type', new Uint8Array([0x06])],
                ['PDP-Context-Type', 'PRIMARY'],
//                    ['PDN-Connection-Charging-ID', 16365252],
//                    ['Serving-Node-Type', 'GTPSGW'],
                ['Charging-Rule-Base-Name', 'up_bypass_h_dra_preprod']
            ]]
        ]]
    ]);
    ccri.retransmission = 0;
    sendCCRi(conn, ccri).then(() => {
        sess.ccrn++;
        setTimeout(doCCRu, argv.updateInterval, conn, sess);
    }, () => {
        sendDPR(conn);
    });
};

const sendCCRu = (conn, ccru) => {
    return new Promise((resolve, reject) => {
        conn.sendRequest(ccru).then((ccau) => {
            //console.log(ccau);
            resolve();
        }, (cceu) => {
            console.log(`Error sending CCR-u: ${cceu}`);
            // retransmit logic in the case of timeout
            if ( cceu.name === 'TimeoutError' && ccru.retransmission++ < argv.maxRetransmit ) {
                console.log(`Timeout, doing retransmission #${ccru.retransmission}`);
                ccru.header.flags.potentiallyRetransmitted = true;
                sendCCRu(conn, ccru);
            } else {
                //sendDPR(conn);
                reject();
            }
        });
    });
};

const doCCRu = (conn, sess) => {
    const ccruEventTimestamp = Math.trunc(new Date().getTime() / 1000) + 2208988800;
    const ccru = conn.createRequest('Diameter Credit Control Application', 'Credit-Control', sess.sid);
    ccru.header.flags.proxiable = true;
    ccru.body = ccru.body.concat([
        ['Auth-Application-Id', 'Diameter Credit Control Application'],
        ['Origin-Host', originHost],
        ['Origin-Realm', originRealm],
    ]);
    if ( argv.destinationHost ) {
        ccru.body = ccru.body.concat([
            ['Destination-Host', argv.destinationHost]
        ]);
    }
    if ( argv.destinationRealm ) {
        ccru.body = ccru.body.concat([
            ['Destination-Realm', argv.destinationRealm]
        ]);
    }
    ccru.body = ccru.body.concat([
        ['Service-Context-Id', 'pgw@3gppnetwork.org'],
        ['CC-Request-Type', 'UPDATE_REQUEST'],
        ['CC-Request-Number', sess.ccrn],
        ['User-Name', 'sirobit'],
        ['Origin-State-Id', 123456],
        ['Event-Timestamp', ccruEventTimestamp],
        ['Subscription-Id', [
            ['Subscription-Id-Type', 'END_USER_E164'],
            ['Subscription-Id-Data', sess.e164]
        ]],
        ['Subscription-Id', [
            ['Subscription-Id-Type', 'END_USER_IMSI'],
            ['Subscription-Id-Data', sess.imsi]
        ]],
        ['Multiple-Services-Indicator', 'MULTIPLE_SERVICES_SUPPORTED'],
        ['Multiple-Services-Credit-Control', [
            ['Requested-Service-Unit', 0],
            ['Used-Service-Unit', [
                ['CC-Total-Octets', 0],
                ['CC-Input-Octets', 0],
                ['CC-Output-Octets', 0]
            ]],
            ['Rating-Group', 1],
            ['Service-Identifier', 1],
            ['3GPP-Reporting-Reason', 'VALIDITY_TIME']
        ]],
        ['User-Equipment-Info', [
            ['User-Equipment-Info-Type', 'IMEISV'],
            ['User-Equipment-Info-Value', new Uint8Array([0x40, 0x12, 0x88, 0x88, 0x88, 0x88, 0x18, 0x81])]
        ]],
        ['Service-Information', [
            ['PS-Information', [
                ['3GPP-Charging-Id', new Uint8Array([0x0f, 0x65, 0x16, 0x1f])],
                ['3GPP-PDP-Type', 'IPv4'],
                ['PDP-Address', '10.83.97.101'],
                ['3GPP-GPRS-Negotiated-QoS-Profile', '08-7408000249f0000f4240'],
                ['SGSN-Address', '203.145.68.61'],
                ['GGSN-Address', '203.145.68.67'],
                ['CG-Address', '10.65.51.1'],
                ['3GPP-IMSI-MCC-MNC', '45403'],
                ['3GPP-GGSN-MCC-MNC', '45403'],
                ['3GPP-NSAPI', '5'],
                ['Called-Station-Id', 'pgw.test.com'],
                ['3GPP-Session-Stop-Indicator', new Uint8Array([0xff])],
                ['3GPP-Selection-Mode', '0'],
                ['3GPP-Charging-Characteristics', '0800'],
                ['3GPP-SGSN-MCC-MNC', '45403'],
                ['3GPP-User-Location-Info', new Uint8Array([0x82, 0x54, 0xf4, 0x30, 0x08, 0x48, 0x54, 0xf4, 0x30, 0x09, 0x2f, 0xf4, 0x03])],
                ['3GPP-MS-TimeZone', new Uint8Array([0x23, 0x00])],
                ['3GPP-RAT-Type', new Uint8Array([0x06])],
                ['Charging-Rule-Base-Name', 'up_bypass_h_dra_preprod']
            ]]
        ]]
    ]);
    ccru.retransmission = 0;
    sendCCRu(conn, ccru).then(() => {;
        //sess.ccrn++;
        if ( sess.ccrn++ >= argv.update ) {
            setTimeout(doCCRt, argv.updateInterval, conn, sess);
        } else {
            //console.log(`Next CCR-U in ${argv.updateInterval}ms`);
            //setTimeout(sendCCRu, wait_time, conn, sid, ccrn + 1);
            setTimeout(doCCRu, argv.updateInterval, conn, sess);
        }
    }, () => {
        sendDPR(conn);
    });
};

const sendCCRt = (conn, ccrt) => {
    conn.sendRequest(ccrt).then((ccat) => {
        //console.log(ccat);
        if ( argv.DPR ) {
            setTimeout(() => {
                sendDPR(conn);
            }, argv.DPR);
        }
    }, (ccet) => {
        console.log(`Error sending CCR-t: ${ccet}`);
        sendDPR(conn);
    });
};

const doCCRt = (conn, sess) => {
    const ccrtEventTimestamp = Math.trunc(new Date().getTime() / 1000) + 2208988800;
    //const ccrtCCTime = ccrtEventTimestamp - sessionsTime[sid];
    sess.ccrtTimestamp = ccrtEventTimestamp;
    const ccrtCCTime = ccrtEventTimestamp - sess.ccriTimestamp;
    const ccrt = conn.createRequest('Diameter Credit Control Application', 'Credit-Control', sess.sid);
    ccrt.header.flags.proxiable = true;
    ccrt.body = ccrt.body.concat([
        ['Auth-Application-Id', 'Diameter Credit Control Application'],
        ['Origin-Host', originHost],
        ['Origin-Realm', originRealm],
    ]);
    if ( argv.destinationHost ) {
        ccrt.body = ccrt.body.concat([
            ['Destination-Host', argv.destinationHost]
        ]);
    }
    if ( argv.destinationRealm ) {
        ccrt.body = ccrt.body.concat([
            ['Destination-Realm', argv.destinationRealm]
        ]);
    }
    ccrt.body = ccrt.body.concat([
        ['Service-Context-Id', 'pgw@3gppnetwork.org'],
        ['CC-Request-Type', 'TERMINATION_REQUEST'],
        ['CC-Request-Number', sess.ccrn],
        ['User-Name', 'sirobit'],
        ['Origin-State-Id', 123456],
        ['Event-Timestamp', ccrtEventTimestamp],
        ['Subscription-Id', [
            ['Subscription-Id-Type', 'END_USER_E164'],
            ['Subscription-Id-Data', sess.e164]
        ]],
        ['Subscription-Id', [
            ['Subscription-Id-Type', 'END_USER_IMSI'],
            ['Subscription-Id-Data', sess.imsi]
        ]],
        ['Termination-Cause', 'DIAMETER_LOGOUT'],
        ['Multiple-Services-Indicator', 'MULTIPLE_SERVICES_SUPPORTED'],
        ['Multiple-Services-Credit-Control', [
            ['Used-Service-Unit', [
                ['CC-Time', ccrtCCTime],
                ['CC-Total-Octets', 457469],
                ['CC-Input-Octets', 56304],
                ['CC-Output-Octets', 401165]
            ]],
            ['Rating-Group', 1],
            ['Service-Identifier', 1],
            ['3GPP-Reporting-Reason', 'FINAL']
        ]],
        ['User-Equipment-Info', [
            ['User-Equipment-Info-Type', 'IMEISV'],
            ['User-Equipment-Info-Value', new Uint8Array([0x40, 0x12, 0x88, 0x88, 0x88, 0x88, 0x18, 0x81])]
        ]],
        ['Service-Information', [
            ['PS-Information', [
                ['3GPP-Charging-Id', new Uint8Array([0x0f, 0x65, 0x16, 0x1f])],
                ['3GPP-PDP-Type', 'IPv4'],
                ['PDP-Address', '10.83.97.101'],
                ['3GPP-GPRS-Negotiated-QoS-Profile', '08-7408000249f0000f4240'],
                ['SGSN-Address', '203.145.68.61'],
                ['GGSN-Address', '203.145.68.67'],
                ['CG-Address', '10.65.51.1'],
                ['3GPP-IMSI-MCC-MNC', '45403'],
                ['3GPP-GGSN-MCC-MNC', '45403'],
                ['3GPP-NSAPI', '5'],
                ['Called-Station-Id', 'pgw.test.com'],
                ['3GPP-Session-Stop-Indicator', new Uint8Array([0xff])],
                ['3GPP-Selection-Mode', '0'],
                ['3GPP-Charging-Characteristics', '0800'],
                ['3GPP-SGSN-MCC-MNC', '45403'],
                ['3GPP-User-Location-Info', new Uint8Array([0x82, 0x54, 0xf4, 0x30, 0x08, 0x48, 0x54, 0xf4, 0x30, 0x09, 0x2f, 0xf4, 0x03])],
                ['3GPP-MS-TimeZone', new Uint8Array([0x23, 0x00])],
                ['3GPP-RAT-Type', new Uint8Array([0x06])],
                ['Charging-Rule-Base-Name', 'up_bypass_h_dra_preprod']
            ]]
        ]]
    ]);
    ccrt.retransmission = 0;
    sendCCRt(conn, ccrt);
/*
    conn.sendRequest(ccrt).then((ccat) => {
        //console.log(ccat);
        if ( argv.DPR ) {
            setTimeout(() => {
                sendDPR(conn);
            }, argv.DPR);
        }
    }, (ccet) => {
        console.log(`Error sending CCR-t: ${ccet}`);
        sendDPR(conn);
    });
*/
};

const pgw = diameter.createConnection(clientOptions, () => {
    const connection = pgw.diameterConnection;
    const cer = connection.createRequest('Diameter Common Messages', 'Capabilities-Exchange', peeringSessionId);
    cer.body = cer.body.concat([
        ['Origin-Host', peerOriginHost],
        ['Origin-Realm', peerOriginRealm],
        ['Host-IP-Address', argv.localAddress],
        ['Vendor-Id', 10415],
        ['Product-Name', 'Node.js UGW']
    ]);
    //console.log(`${Array.isArray(cer.body)}`);
    connection.sendRequest(cer).then((cea) => {
        const ceaOriginHost = findValue(cea.body, 'Origin-Host');
        const ceaOriginRealm = findValue(cea.body, 'Origin-Realm');
        if ( peerDestinationHost && ceaOriginHost !== peerDestinationHost ) {
            console.warn(`CEA Origin-Host <${ceaOriginHost}> does not agree with the expected value <${peerDestinationHost}>`);
        }
        if ( peerDestinationRealm && ceaOriginRealm !== peerDestinationRealm ) {
            console.warn(`CEA Origin-Realm <${ceaOriginRealm}> does not agree with the expected value <${peerDestinationRealm}>`);
        }
        if ( argv.deviceWatchdogInterval ) {
            setInterval(doDWR, argv.deviceWatchdogInterval, connection);
        }
        // setting up signal handling
        process.on('SIGTERM', () => {
            console.error('SIGTERM received');
            if ( stopping ) {
                console.error('Forcibly exit');
                process.exit(1);
            }
            stopping = true;
            sendDPR(connection);
        });
        process.on('SIGINT', () => {
            console.error('SIGINT received');
            if ( stopping ) {
                console.error('Forcibly exit');
                process.exit(1);
            }
            stopping = true;
            sendDPR(connection);
        });
        //const ccSid = sessionId(originHost);
        //const ccSid = sessionId();
        //setTimeout(doCCRi, 0, connection, ccSid);
        //doCCRi(connection, sessionId());
        Promise.all(sessions.map((s) => {
            return new Promise((resolve, reject) => {
                console.log(`Working on ${JSON.stringify(s)}`);
                doCCRi(connection, s);
            });
        }));
/*
        Promise.all(sessions.map((s) => {
            return new Promise((resolve, reject) => {
                console.log(`Working on ${JSON.stringify(s)}`);
                const ccriEventTimestamp = Math.trunc(new Date().getTime() / 1000) + 2208988800;
                const ccri = connection.createRequest(applicationId, 'Credit-Control', s.sid);
                ccri.header.flags.proxiable = true;
                ccri.body = ccri.body.concat([
                    ['Auth-Application-Id', '3GPP Gx'],
                    ['Origin-Host', originHost],
                    ['Origin-Realm', originRealm],
                ]);
                if ( argv.destinationHost ) {
                    ccri.body = ccri.body.concat([
                        ['Destination-Host', argv.destinationHost]
                    ]);
                }
                ccri.body = ccri.body.concat([
                    ['Destination-Realm', argv.destinationRealm],
                    ['CC-Request-Type', 'INITIAL_REQUEST'],
                    ['CC-Request-Number', 0],
                    ['Origin-State-Id', 123456],
                    ['QoS-Information', [
                        ['APN-Aggregate-Max-Bitrate-UL', 150000000],
                        ['APN-Aggregate-Max-Bitrate-DL', 1000000000]
                    ]],
                    ['Default-EPS-Bearer-QoS', [
                        ['QoS-Class-Identifier', 'QCI_8'],
                        ['Allocation-Retention-Priority', [
                            ['Priority-Level', 13],
                            ['Pre-emption-Capability', 'PRE-EMPTION_CAPABILITY_DISABLED'],
                            ['Pre-emption-Vulnerability', 'PRE-EMPTION_VULNERABILITY_ENABLED']
                        ]]
                    ]],
                    ['Called-Station-Id', 'pgw.test.com'],
                    ['Access-Network-Charging-Address', '203.145.68.67'], //[ 'Access-Network-Charging-Address', new Uint8Array([203, 145, 68, 67]) ],
                    ['Framed-IP-Address', s.ueip], // MODIFY diameter-dictionary from IPAddress to OctetString
                    ['User-Equipment-Info', [
                        ['User-Equipment-Info-Type', 'IMEISV'],
                        ['User-Equipment-Info-Value', new Uint8Array([0x53, 0x02, 0x46, 0x01, 0x00, 0x40, 0x16, 0x10])]
                    ]],
                    ['Online', 'ENABLE_ONLINE'],
                    ['Offline', 'ENABLE_OFFLINE'],
                    ['Access-Network-Charging-Identifier-Gx', [
                        ['Access-Network-Charging-Identifier-Value', new Uint8Array([0x0f, 0x65, 0x16, 0x1f])]
                    ]],
                    ['3GPP-SGSN-Address', new Uint8Array([203, 145, 68, 67])], // MODIFY diameter-dictionary from IPAddress to OctetString
                    ['AN-GW-Address', '203.145.68.67'],
                    ['RAT-Type', 'EUTRAN'],
                    ['Network-Request-Support', 'NETWORK_REQUEST SUPPORTED'],
                    ['3GPP-SGSN-MCC-MNC', '45403'],
                    ['3GPP-User-Location-Info', new Uint8Array([0x82, 0x54, 0xf4, 0x30, 0x08, 0x48, 0x54, 0xf4, 0x30, 0x09, 0x2f, 0xf4, 0x03])],
                    ['Subscription-Id', [
                        ['Subscription-Id-Type', 'END_USER_E164'],
                        ['Subscription-Id-Data', s.e164]
                    ]],
                    ['Subscription-Id', [
                        ['Subscription-Id-Type', 'END_USER_IMSI'],
                        ['Subscription-Id-Data', s.imsi]
                    ]],
                    ['Supported-Features', [
                        ['Vendor-Id', 10415],
                        ['Feature-List-ID', 1],
                        ['Feature-List', 3]
                    ]],
                    ['IP-CAN-Type', '3GPP-EPS']
                ]);
                connection.sendRequest(ccri).then((ccai) => {
                    // only continue if CCA-i is positive
                    if ( findValue(ccai.body, 'Result-Code') === 'DIAMETER_SUCCESS' ) {
                        setTimeout(() => {
                            let loop = argv.update;
                            const sendCCRU = () => {
                                const ccru = connection.createRequest(applicationId, 'Credit-Control', s.sid);
                                ccru.header.flags.proxiable = true;
                                ccru.body = ccru.body.concat([
                                    ['Auth-Application-Id', '3GPP Gx'],
                                    ['Origin-Host', originHost],
                                    ['Origin-Realm', originRealm],
                                ]);
                                if ( argv.destinationHost ) {
                                    ccru.body = ccru.body.concat([
                                        ['Destination-Host', argv.destinationHost]
                                    ]);
                                }
                                ccru.body = ccru.body.concat([
                                    ['Destination-Realm', argv.destinationRealm],
                                    ['CC-Request-Type', 'UPDATE_REQUEST'],
                                    ['CC-Request-Number', argv.update - loop + 1],
                                    ['Origin-State-Id', 123456],
                                    ['Event-Trigger', 'POLICY ENFORCEMENT FAILED'],
                                    ['Called-Station-Id', 'pgw.test.com'],
                                    ['Framed-IP-Address', s.ueip],
                                    ['User-Equipment-Info', [
                                        ['User-Equipment-Info-Type', 'IMEISV'],
                                        ['User-Equipment-Info-Value', new Uint8Array([0x53, 0x02, 0x46, 0x01, 0x00, 0x40, 0x16, 0x10])]
                                    ]],
                                    ['3GPP-SGSN-Address', new Uint8Array([203, 145, 68, 67])],
                                    ['3GPP-SGSN-MCC-MNC', '45403'],
                                    ['Subscription-Id', [
                                        ['Subscription-Id-Type', 'END_USER_E164'],
                                        ['Subscription-Id-Data', s.e164]
                                    ]],
                                    ['Subscription-Id', [
                                        ['Subscription-Id-Type', 'END_USER_IMSI'],
                                        ['Subscription-Id-Data', s.imsi]
                                    ]],
                                    ['IP-CAN-Type', '3GPP-EPS'],
                                    ['3GPP-User-Location-Info', new Uint8Array([0x82, 0x54, 0xf4, 0x30, 0x08, 0x48, 0x54, 0xf4, 0x30, 0x09, 0x2f, 0xf4, 0x03])]
                                ]);
                                console.log(`<-[]${s.e164} CCR-u #${argv.update - loop + 1}/${argv.update}`);
                                const ccruStart = process.hrtime.bigint();
                                connection.sendRequest(ccru).then((ccau) => {
                                    const timeDiff = Number(process.hrtime.bigint() - ccruStart) / 1000000000;
                                    ccruTotalTime += timeDiff;
                                    ccruTotal++;
                                    const ccauRequestNumber = findValue(ccau.body, 'CC-Request-Number');
                                    if ( timeDiff > 3 ) {
                                        slower3.push({ 'session-id': s.sid, 'cc-request-number': ccauRequestNumber, 'time-diff': timeDiff });
                                    }
                                    console.log(`->[]${s.e164} CCA-u #${ccauRequestNumber}/${argv.update} => ${findValue(ccau.body, 'Result-Code')}`);
                                    let i = 0;
                                    for ( ; i < slowest.length; i++ ) {
                                        if ( timeDiff > slowest[i]['time-diff'] ) {
                                            break;
                                        }
                                    }
                                    slowest.splice(i, 0, { 'session-id': s.sid, 'cc-request-number': ccauRequestNumber, 'time-diff': timeDiff });
                                    if ( slowest.length > argv.slowest ) slowest.length = argv.slowest;
                                }, (ccru_e) => {
                                    console.error(`Error sending CCR-u for ${s.e164} #${findValue(ccru.body, 'CC-Request-Number')}: ${ccru_e}`);
                                    reject(s.e164);
                                });
                                if ( --loop === 0 ) {
                                    setTimeout(() => {
                                        console.log(`<-[]Sending CCR-t for ${s.e164} ${argv.update + 1}`);
                                        const ccrtCCTime = Math.trunc(new Date().getTime() / 1000) + 2208988800 - ccriEventTimestamp;
                                        const ccrt = connection.createRequest(applicationId, 'Credit-Control', s.sid);
                                        ccrt.header.flags.proxiable = true;
                                        ccrt.body = ccrt.body.concat([
                                            ['Auth-Application-Id', '3GPP Gx'],
                                            ['Origin-Host', originHost],
                                            ['Origin-Realm', originRealm],
                                        ]);
                                        if ( argv.destinationHost ) {
                                            ccrt.body = ccrt.body.concat([
                                                ['Destination-Host', argv.destinationHost]
                                            ]);
                                        }
                                        ccrt.body = ccrt.body.concat([
                                            ['Destination-Realm', argv.destinationRealm],
                                            ['CC-Request-Type', 'TERMINATION_REQUEST'],
                                            ['CC-Request-Number', argv.update + 1],
                                            ['Origin-State-Id', 123456],
                                            ['Termination-Cause', 'DIAMETER_LOGOUT'],
                                            ['Called-Station-Id', 'pgw.test.com'],
                                            ['Subscription-Id', [
                                                ['Subscription-Id-Type', 'END_USER_E164'],
                                                ['Subscription-Id-Data', s.e164]
                                            ]],
                                            ['Subscription-Id', [
                                                ['Subscription-Id-Type', 'END_USER_IMSI'],
                                                ['Subscription-Id-Data', s.imsi]
                                            ]]
                                        ]);
                                        connection.sendRequest(ccrt).then((ccat) => {
                                            console.log(`->[]Received CCA-t for ${s.e164} ${findValue(ccat.body, 'Result-Code')} \u2705`);
                                            for ( let i = 0; i < sessions.length; i++ ) {
                                                if ( sessions[i].e164 == s.e164 ) {
                                                    sessions.splice(i);
                                                    break;
                                                }
                                            }
                                            resolve(s.e164);
                                        }, (ccrt_e) => {
                                            console.error(`Error sending CCR-t for ${s.e164}: ${ccrt_e}`);
                                            reject(s.e164);
                                        });
                                    }, argv.interval);
                                    return;
                                }
                                setTimeout(sendCCRU, argv.interval);
                            };
                            sendCCRU();
                        }, argv.interval);
                    } else {
                        console.warn(`CCR-i for <${s.e164}> is not successful, Result-Code is <${findValue(ccai.body, 'Result-Code')}>`);
                        resolve(s.e164);
                    }
                }, (ccri_e) => {
                    console.error(`Error sending CCR-i for ${s.e164}: ${ccri_e}`);
                    reject(`${s.e164} ${ccri_e}`);
                });
            });
        })).then(() => {
            console.log('Promise.all DONE');
            //console.dir(slowest);
            console.log(`total time used for CCR-u: ${ccruTotalTime}`);
            console.log(`total number of CCR-u: ${ccruTotal}`);
            console.log(`average time for CCR-u: ${ccruTotalTime / ccruTotal}`);
            console.log(`CCR-u slower than 3 seconds: ${slower3.length}`);
            if ( !argv.keepalive ) {
                process.exit(0);
            }
        }).catch((e) => {;
            console.error(`Promise.all ERROR ${e}`);
            if ( !argv.keepalive ) {
                process.exit(1);
            }
        });
*/
    }, (cee) => {
        console.log(`Error sending CER: ${cee}`);
        connection.end();
    });
});
// Handling server initiated messages:
pgw.on('diameterMessage', (event) => {
    //console.log('Received server initiated message');
    if ( event.message.command === 'Capabilities-Exchange' ) {
        event.response.body = event.response.body.concat([
            ['Result-Code', 'DIAMETER_SUCCESS'],
            ['Origin-Host', originHost],
            ['Origin-Realm', originRealm],
            //['Host-IP-Address', '2001:db8:3312::1'],
            ['Host-IP-Address', `fd1e:1dff:97ed::${listener.split('.').map((o) => parseInt(o).toString(16).padStart(2, '0')).reduce((r, e, i) => (i % 2 ? r[r.length - 1] += e: r.push(e)) && r, []).map((oo) => oo.replace(/^0+/, '')).join(':')}`],
            ['Host-IP-Address', listener],
            ['Vendor-Id', 123],
            ['Product-Name', 'node-diameter']
        ]);
        event.callback(event.response);
        // socket.diameterConnection.end();
    } else if ( event.message.command === 'Device-Watchdog' ) {
        event.response.body = event.response.body.concat([
            ['Result-Code', 'DIAMETER_SUCCESS'],
            ['Origin-Host', originHost],
            ['Origin-Realm', originRealm]
        ]);
        event.callback(event.response);
    } else if ( event.message.command === 'Re-Auth' ) {
        event.response.body = event.response.body.concat([
            ['Result-Code', 'DIAMETER_SUCCESS'],
            ['Origin-Host', originHost],
            ['Origin-Realm', originRealm]
        ]);
        event.callback(event.response);
    }
});
pgw.on('error', (err) => {
    console.error(err);
});
