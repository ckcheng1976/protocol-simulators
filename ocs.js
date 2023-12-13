'use strict';

const diameter = require('diameter');
const yargs = require('yargs');
const express = require('express');
const crypto = require('crypto');

const argv = yargs
    .option('mode', {
        alias: 'm',
        desc: 'Specify HSS running mode',
        type: 'string',
        default: 'single',
        choices: ['single', 'flow']
    })
    .option('listener', {
        alias: 'l',
        desc: 'Specify listener address',
        type: 'string',
        default: '172.19.3.1'
    })
    .option('port', {
        alias: 'p',
        desc: 'Specify listener port',
        type: 'number',
        default: 3868
    })
    .option('realm', {
        alias: 'r',
        desc: 'Specify Origin-Realm for this OCS',
        type: 'string',
        default: 'epc.mnc006.mcc454.3gppnetwork.org'
    })
    .option('host', {
        alias: 'h',
        desc: 'Specify Origin-Host for this OCS',
        type: 'string'
    })
    .option('delay', {
        alias: 'd',
        desc: 'Specify a delay for the Answer message in milliseconds',
        type: 'number'
    })
    .option('rar-sid', {
        desc: 'Add a specific Session-Id to the list for sending RAR',
        type: 'string',
        array: true
    })
    .option('rar-interval', {
        desc: 'Send RAR to all Session-Id(s) every n milliseconds',
        type: 'number'
    })
    .option('rar-dest-host', {
        desc: 'Default Destination-Host to be used for sending RAR if not specified',
        type: 'string'
    })
    .option('rar-dest-realm', {
        desc: 'Default Destination-Realm to be used for sending RAR if not specified',
        type: 'string'
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
    .option('ccr-count', {
        desc: 'Print CCR count every n seconds',
        type: 'number'
    })
    /*
    .option('ccr-error-percentage', {
        desc: 'TODO',
        type: 'number'
    })
    */
    .option('api', {
        desc: 'Specify the endpoint for running a RESTful API server',
        requiresArg: true,
        type: 'string'
    })
    .help()
    .argv;
/*
var client_options = {
    beforeAnyMessage: diameter.logMessage,
    afterAnyMessage: diameter.logMessage,
    host: '172.19.3.222',
    port: 3868
};
*/

//Array.prototype.findValue = function(key) {
//    return this.find((avp) => { return avp[0] === key; })[1];
//};
//Array.prototype.findValue = function(key) {
//    let row = this.find(avp => { return avp[0] === key; });
//    return row ? row[1] : undefined;
//};
//Array.prototype.findValues = function(key) {
//    return this.filter(row => row[0] === key);
//}
const findValue = (a, k) => {
    let o = a.find((avp) => { return avp[0] === k; });
    return o ? o[1] : undefined;
};

const f0 = new Intl.DateTimeFormat('ja', { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const debugLog = (m) => {
    //console.log(JSON.stringify(m));
    if ( argv.skipLogApplication && argv.skipLogApplication.includes(m.header.applicationId) || argv.skipLogCommand && argv.skipLogCommand.includes(m.header.commandCode) ) {
        return;
    }
    const dirChar = m.hasOwnProperty('_timeReceived') ? '->[]' : '<-[]';
    if ( argv.debugLevel == 2 ) {
        console.log(`${dirChar} +${'-'.repeat(21)}+`);
        console.log(`${dirChar} | ${f0.format(new Date())} |`);
        console.log(`${dirChar} +${'-'.repeat(21)}+`);
        diameter.logMessage(m);
    } else {
        console.log(`${dirChar} +${'-'.repeat(67)}`);
        console.log(`${dirChar} ${['|', f0.format(new Date()), m.command + (m.header.flags.request ? '-Request' : '-Answer'), m.header.flags.error ? '(!)' : '', m.header.flags.potentiallyRetransmitted ? '(T)' : ''].join(' ')}`);
        console.log(`${dirChar} +${'-'.repeat(67)}`);
        for ( let i = 0; i < m.body.length; i++ ) {
            if ( ['session-id', '-host', '-realm', 'result-code', 'cc-request-'].some((s) => m.body[i][0].toLowerCase().includes(s)) ) {
                console.log(`${dirChar} | ${m.body[i].join(': ')}`);
            }
        }
        console.log(`${dirChar} +${'-'.repeat(67)}`);
    }
};

const server_options = {
    timeout: 60000,
    beforeAnyMessage: debugLog,
    afterAnyMessage: debugLog
};

/*
var args = process.argv.slice(2);

var originRealm = args.length > 0 ? args[0] : 'kit.com';
var originHost = args.length > 1 ? args[1] : 'hss-' + (Math.random() * Number.MAX_SAFE_INTEGER).toString(36).replace(/[^a-zA-Z0-9]+/g, '').substr(0, 4) + '.' + originRealm;
*/

const originRealm = argv.realm;
//var originHost = argv.host ? (argv.host.endsWith(originRealm) ? argv.host : argv.host + '.' + argv.realm) : 'ocs-' + (Math.random() * Number.MAX_SAFE_INTEGER).toString(36).replace(/[^a-zA-Z0-9]+/g, '').substr(0, 6) + '.' + originRealm;
const originHost = argv.host ? argv.host : 'ocs-' + (Math.random() * Number.MAX_SAFE_INTEGER).toString(36).replace(/[^a-zA-Z0-9]+/g, '').substr(0, 6) + '.' + originRealm;

//const sessionIdGenerator = () => {
//    //var high32bit = Math.floor(new Date().getTime() / 1000);
//    let high32bit = new Date().toISOString().replace(/[^0-9]/g, '').substring(0, 14);
//    let low32bit = 1;
//    return () => { return [originHost, high32bit, low32bit++, new Date().getTime()].join(';'); };
//};
//var sessionId = sessionIdGenerator();
//var destinationList = [];
let totalCcr = 0;
//var ccrs = [];
let startTime = 0;

const sockets = new Set();
const sessions = (argv.rarSid || []).reduce((c, v) => c.set(v, undefined), new Map());
const rarInstructions = [];
const delayInstructions = {};
const ccrResultCodes = { 'DIAMETER_SUCCESS': 1 };
let ccrResultCodeSum = 1;
let ccrErrorPercentage = argv.ccrErrorPercentage || 0;

const rarSchedule = (entry, periodic = false) => {
    const delay = entry.instruction.timing === 'after' ? 0 : entry.instruction.value;
    entry.__schedule = setTimeout((e) => {
        e['status'] = 'running';
        const sid = e['session-id'];
        if ( sockets.size == 0 ) {
            console.warn(`No connection available! No more RAR schedule for ${sid}`);
            e['status'] = 'error';
        } else {
            //console.log(`${new Date()}: RAR for ${sid}`);
            const socket = (sessions.get(sid) && sessions.get(sid).socket) || [...sockets][Math.floor(Math.random() * sockets.size)];
            const logTag = `<<${socket.remoteAddress}:${socket.remotePort}>> `;
            const connection = socket.diameterConnection;
            //const targetHost = 'fake.fake.com';
            //const targetRealm = 'fake.com';
            const targetHost = 'pgw11.yellow.kit';
            const targetRealm = 'yellow.kit';
            console.log(`${logTag}<-[]Sending RAR to ${targetHost} on Session-Id ${sid}`);
            const rar = connection.createRequest('Diameter Credit Control Application', 'Re-Auth', sid);
            rar.header.flags.proxiable = true;
            rar.body = rar.body.concat([
                ['Origin-Host', originHost],
                ['Origin-Realm', originRealm],
                ['Destination-Host', targetHost],
                ['Destination-Realm', targetRealm],
                ['Auth-Application-Id', 'Diameter Credit Control Application'],
                ['Re-Auth-Request-Type', 'AUTHORIZE_ONLY']
            ]);
            connection.sendRequest(rar).then((raa) => {
                console.log(`${logTag}->[]Received RAA with Session-Id ${findValue(raa.body, 'Session-Id')} (matched? ${findValue(raa.body, 'Session-Id') == sid}), Result-Code ${findValue(raa.body, 'Result-Code')}`);
                //resolve(s);
            }, (rar_e) => {
                console.log(`${logTag}Error sending RAR for ${sid}: ${rar_e}`);
                //reject(s);
                e['status'] = 'error';
            });
            if ( periodic ) {
                rarSchedule(e, periodic);
            } else {
                e['status'] = 'finished';
            }
        }
    }, delay, entry);
};

if ( argv.api ) {
    let [apiHost, apiPort] = argv.api.split(':');
    if ( apiPort === undefined ) {
        apiPort = Number.isInteger(parseInt(apiHost)) ? parseInt(apiHost) : (console.warn('API port must be an integer; default to be 8080'), 8080);
        apiHost = 'localhost';
    } else {
        apiPort = Number.isInteger(parseInt(apiPort)) ? parseInt(apiPort) : (console.warn('API port must be an integer; default to be 8080'), 8080);
    }
    console.log(`API server listening on http://${apiHost}:${apiPort}/api`);
    const restApi = express();
    restApi.set('json replacer', (k, v) => k.startsWith('__') ? undefined : v);
    restApi.use(express.json());
    restApi.get('/api', (req, res) => {
        res.json([1]);
    });
    restApi.get('/api/1', (req, res) => {
        res.json(['sockets', 'session-ids', 'rar', 'delay', 'ccr-result-codes']);
    });
    restApi.get('/api/1/sockets', (req, res) => {
        res.json([...sockets].map((s) => `${s.remoteAddress}:${s.remotePort}`));
    });
    restApi.get('/api/1/session-ids', (req, res) => {
        res.json(Array.from(sessions.entries()).map((p) => p[0]));
    });
    restApi.get('/api/1/session-ids/:sid', (req, res) => {
        if ( sessions.has(req.params.sid) ) {
            const s = sessions.get(req.params.sid);
            res.json({ 'avp': s.avp, 'last': s.last, 'lastFormatted': f0.format(s.last), 'from': `${s.socket.remoteAddress}:${s.socket.remotePort}` });
        } else {
            res.json({});
        }
    });
    restApi.delete('/api/1/session-ids/:sid', (req, res) => {
        res.json({ 'status': sessions.delete(req.params.sid) ? 0 : 1 });
    });
    restApi.get('/api/1/rar', (req, res) => {
        res.json(rarInstructions);
    });
    restApi.get('/api/1/ccr-result-codes', (req, res) => {
        res.json({ 'status': 0, 'ccr-result-codes': ccrResultCodes });
    });
    restApi.post('/api/1/ccr-result-codes', (req, res) => {
        if ( Object.values(req.body).some((e) => Number.isNaN(Number.parseFloat(e))) ) {
            res.json({ 'status': 1, 'message': 'Value must be a number' });
        } else {
            ccrResultCodeSum = 0;
            for ( let rc in req.body ) {
                //console.log(`${rc} => ${req.body[rc]}`);
                ccrResultCodes[rc] = Number.parseFloat(req.body[rc]);
            }
            for ( let rc in ccrResultCodes ) {
                ccrResultCodeSum += ccrResultCodes[rc];
            }
            res.json({ 'status': 0, 'ccr-result-codes': ccrResultCodes, 'sum': ccrResultCodeSum });
        }
    });
    restApi.delete('/api/1/ccr-result-codes', (req, res) => {
        ccrErrorPercentage = 0;
        ccrResultCodes = { 'DIAMETER_SUCCESS': 1 };
        ccrResultCodeSum = 1;
        res.json({ 'status': 0, 'ccr-result-codes': { 'DIAMETER_SUCCESS': 1 }, 'sum': 1 });
    });
    restApi.post('/api/1/rar', (req, res) => {
        const t = new Date();
        if ( !req.body['session-id'] ) {
            res.json({ 'status': 1, 'message': 'RAR instruction must consist of "session-id"' });
        } else {
            const instruction = { 'session-id': req.body['session-id'], 'instruction': req.body['instruction'] };
            const rid = crypto.createHash('sha1').update(`${JSON.stringify(instruction)}`).digest('base64url');
            if ( rarInstructions.some((r) => r.id == rid) ) {
                res.json({
                    'status': 1,
                    'message': 'RAR instruction already exists',
                    'id': rid
                });
            } else {
                const timing = req.body['instruction'].timing;
                const value = req.body['instruction'].value;
                const entry = Object.assign({ 'id': rid, 'timestamp': t.getTime(), 'status': 'created' }, req.body);
                switch (timing) {
                    case 'periodic':
                        rarSchedule(entry, true);
                        break;
                    case 'once':
                        rarSchedule(entry);
                        break;
                    case 'after':
                        break;
                    default:
                        console.warn(`unknown timing <${timing}> in RAR instruction`);
                        res.json({ 'status': 1, 'message': `unknown timing <${timing}> in RAR instruction` });
                        return;
                }
                //rarInstructions.push(Object.assign({ 'id': id, 'timestamp': t.getTime(), 'status': 'created' }, req.body));
                rarInstructions.push(entry);
                res.json({
                    'status': 0,
                    'message': `RAR instruction added at ${t.toLocaleString('ja', { dateStyle: 'medium', timeStyle: 'medium' })}`,
                    'id': rid
                });
            }
        }
    });
    restApi.patch('/api/1/rar/:rid', (req, res) => {
        const idx = rarInstructions.findIndex((r) => r.id == req.params.rid);
        if ( idx != -1 ) {
            if ( req.body['status'] === 'cancelled' ) {
                const entry = rarInstructions[idx];
                clearTimeout(entry.__to);
                entry.status = 'cancelled';
                res.json({ 'status': 0 });
            }
        } else {
            res.json({ 'status': 1 });
        }
    });
    restApi.delete('/api/1/rar/:rid', (req, res) => {
        const idx = rarInstructions.findIndex((r) => r.id == req.params.rid);
        if ( idx != -1 ) {
            const entry = rarInstructions[idx];
            entry.status = 'cancelled';
            clearTimeout(entry.__to);
            rarInstructions.splice(idx, 1)
            res.json({ 'status': 0 });
        } else {
            res.json({ 'status': 1 });
        }
    });
    restApi.get('/api/1/delay', (req, res) => {
        res.json(delayInstructions);
    });
    restApi.post('/api/1/delay', (req, res) => {
        if ( !req.body.command || !Number.isInteger(req.body.delay) ) {
            res.json({ 'status': 1, 'message': 'Delay instruction must consist of "command" (string) and "delay" (integer)' });
        } else {
            const t = new Date();
            delayInstructions[req.body.command] = { 'timestamp': t.getTime(), 'delay': req.body.delay };
            //delayInstructions.set(req.body.command, { 'timestamp': t.getTime(), 'delay': req.body.delay });
            res.json({ 'status': 0, 'message': `Delay instruction added at ${t.toLocaleString('ja', { dateStyle: 'medium', timeStyle: 'medium' })}`});
        }
    });
    restApi.delete('/api/1/delay/:command', (req, res) => {
        //res.json({ 'status': delayInstructions.delete(req.params.command) ? 0 : 1 });
        if ( delayInstructions.hasOwnProperty(req.params.command) ) {
            delete delayInstructions[req.params.command];
            res.json({ 'status': 0 });
        } else {
            res.json({ 'status': 1 });
        }
    });
    //restApi.listen(argv.api, argv.listener);
    if ( apiHost ) {
        restApi.listen(apiPort, apiHost, argv.listener);
    } else {
        restApi.listen(apiPort, argv.listener);
    }
}

if ( argv.rarInterval ) {
    setInterval(() => {
        if ( !sessions.size ) return;
        if ( sockets.size == 0 ) {
            console.warn('No connection available!');
            return;
        }
        const ss = [...sessions.keys()];
        console.log(`Start sending RAR for ${ss.length} sessions; sockets available: ${[...sockets].map((s) => `${s.remoteAddress}:${s.remotePort}`).join(' ')}`);
        //const cc = ss.reduce((c, v) => v.sock ? c.add(v.sock) : c, new Set());
        //const cc = new Set([...sessions.values()].filter((v) => (v)));
        Promise.all(ss.map(s => {
            return new Promise((resolve, reject) => {
                const socket = (sessions.get(s) && sessions.get(s).socket) || [...sockets][Math.floor(Math.random() * sockets.size)];
                const logTag = `<<${socket.remoteAddress}:${socket.remotePort}>> `;
                const connection = socket.diameterConnection;
                //const targetHost = 'fake.fake.com';
                //const targetRealm = 'fake.com';
                const targetHost = 'pgw11.yellow.kit';
                const targetRealm = 'yellow.kit';
                console.log(`${logTag}<-[]Sending RAR to ${targetHost} on Session-Id ${s}`);
                const rar = connection.createRequest('Diameter Credit Control Application', 'Re-Auth', s);
                rar.header.flags.proxiable = true;
                rar.body = rar.body.concat([
                    ['Origin-Host', originHost],
                    ['Origin-Realm', originRealm],
                    ['Destination-Host', targetHost],
                    ['Destination-Realm', targetRealm],
                    ['Auth-Application-Id', 'Diameter Credit Control Application'],
                    ['Re-Auth-Request-Type', 'AUTHORIZE_ONLY']
                ]);
                connection.sendRequest(rar).then((raa) => {
                    //console.log(`${logTag}->[]Received RAA with Session-Id ${raa.body.findValue('Session-Id')}`);
                    console.log(`${logTag}->[]Received RAA with Session-Id ${findValue(raa.body, 'Session-Id')}, Result-Code ${findValue(raa.body, 'Result-Code')}`);
                    resolve(s);
                }, (rar_e) => {
                    console.log(`${logTag}Error sending RAR for ${s}: ${rar_e}`);
                    reject(s);
                });
            });
        })).then((v) => {
            console.log(`Finished sending RAR for ${ss.length} sessions, value: ${v}`);
        }, (e) => {
            console.error(`Error sending RAR for ${ss.length} sessions, error: ${e}`);
        });
    }, argv.rarInterval);
}

const ocsServer = diameter.createServer(server_options, (socket) => {
    socket.on('diameterMessage', (event) => {
        sockets.add(socket);
        let response = undefined;
        let peerMessage = true;
        if ( event.message.command === 'Capabilities-Exchange' ) {
            event.response.body = event.response.body.concat([
                ['Result-Code', 'DIAMETER_SUCCESS'],
                ['Origin-Host', originHost],
                ['Origin-Realm', originRealm],
                ['Host-IP-Address', argv.listener],
                ['Host-IP-Address', `fd1e:1dff:97ed::${argv.listener.split('.').map((o) => parseInt(o).toString(16).padStart(2, '0')).reduce((r, e, i) => (i % 2 ? r[r.length - 1] += e: r.push(e)) && r, []).map((oo) => oo.replace(/^0+/, '')).join(':')}`],
                ['Vendor-Id', 10415],
                ['Product-Name', 'node-diameter']
            ]);
            //event.callback(event.response);
            response = event.response;
        } else if ( event.message.command === 'Device-Watchdog' ) {
            event.response.body = event.response.body.concat([
                ['Result-Code', 'DIAMETER_SUCCESS'],
                ['Origin-Host', originHost],
                ['Origin-Realm', originRealm]
            ]);
            //event.callback(event.response);
            response = event.response;
        } else if ( event.message.command === 'Disconnect-Peer' ) {
            event.response.body = event.response.body.concat([
                ['Result-Code', 'DIAMETER_SUCCESS'],
                ['Origin-Host', originHost],
                ['Origin-Realm', originRealm]
            ]);
            //event.callback(event.response);
            response = event.response;
        } else if ( event.message.command === 'Credit-Control' ) {
            peerMessage = false;
            const sessionId = findValue(event.message.body, 'Session-Id');
            const sessionDetail = sessions.get(sessionId) || { avp: {} };
            sessionDetail.last = new Date().getTime();
            sessionDetail.socket = socket;
            if ( totalCcr == 0 ) {
                startTime = new Date().getTime();
            }
            totalCcr++;
            let resultCode = 'DIAMETER_SUCCESS';
            let bucket = 0.0;
            const r = Math.random() * ccrResultCodeSum;
            for ( let rc in ccrResultCodes ) {
               bucket += ccrResultCodes[rc];
               if ( r <= bucket ) {
                   resultCode = rc;
                   break;
               }
            }
            if ( resultCode !== 'DIAMETER_SUCCESS' ) {
                event.response.body = event.response.body.concat([
                    ['Result-Code', resultCode],
                    ['Origin-Host', originHost],
                    ['Origin-Realm', originRealm],
                    //['Destination-Host', 'some-pcrf-host'],
                    //['Destination-Realm', 'some-pcrf-realm']
                    ['Destination-Host', findValue(event.message.body, 'Origin-Host')],
                    ['Destination-Realm', findValue(event.message.body, 'Origin-Realm')]
                ]);
            } else {
                //ccrs.push(event.message.body.findValue('Session-Id'));
                event.response.body = event.response.body.concat([
                    ['Result-Code', 'DIAMETER_SUCCESS'],
                    ['Origin-Host', originHost],
                    ['Origin-Realm', originRealm],
                    //['Destination-Host', 'some-pcrf-host'],
                    //['Destination-Realm', 'some-pcrf-realm']
                    ['Destination-Host', findValue(event.message.body, 'Origin-Host')],
                    ['Destination-Realm', findValue(event.message.body, 'Origin-Realm')]
                ]);
                if ( findValue(event.message.body, 'Auth-Application-Id') ) {
                    event.response.body = event.response.body.concat([['Auth-Application-Id', findValue(event.message.body, 'Auth-Application-Id')]]);
                }
                if ( findValue(event.message.body, 'CC-Request-Type') ) {
                    event.response.body = event.response.body.concat([['CC-Request-Type', findValue(event.message.body, 'CC-Request-Type')]]);
                    sessionDetail.avp.lastCCRequestType = findValue(event.message.body, 'CC-Request-Type');
                }
                const ccRequestNumber = findValue(event.message.body, 'CC-Request-Number');
                if ( Number.isInteger(ccRequestNumber) ) {
                    event.response.body = event.response.body.concat([['CC-Request-Number', ccRequestNumber]]);
                    sessionDetail.avp.lastCCRequestNumber = ccRequestNumber;
                    const rarInstructionsAfter = rarInstructions.filter((e) => e['session-id'] === sessionId && e['instruction'].timing === 'after' && e['instruction'].value < ccRequestNumber && e['status'] !== 'finished');
                    rarInstructionsAfter.forEach((e) => { rarSchedule(e) });
                }
                sessions.set(sessionId, sessionDetail);
                event.response.body = event.response.body.concat([
                    ['Multiple-Services-Credit-Control', [
                        ['Granted-Service-Unit', [
                            ['CC-Time', 99999],
                            ['CC-Total-Octets', 31457280],
                        ]],
                        ['Volume-Quota-Threshold', 6291456],
                        //['Rating-Group', event.message.body.findValue('Rating-Group')],
                        //['Service-Identifier', event.message.body.findValue('Service-Identifier')],
                        ['Result-Code', 2001],
                        ['Validity-Time', 3600],
                        ['Quota-Holding-Time', 0]
                    ]]
                ]);
                //event.callback(event.response);
                //if ( argv.delay ) {
                //    setTimeout(() => {
                //        event.callback(event.response);
                //    }, argv.delay * 1000);
                //} else {
                //    event.callback(event.response);
                //}
            }
            response = event.response;
/*
                if ( event.message.body.findValue('CC-Request-Type') == 'UPDATE_REQUEST' && argv.RAR ) {
                    let x = argv.RAR;
                    let id = setInterval(function() {
                        if ( x > 0 ) {
                            console.log('Sending server initiated Re-Auth-Request in ' + x-- + ' seconds...');
                        } else {
                            clearInterval(id);
                            var connection = socket.diameterConnection;
                            //var existingSid = connection.getSessionId();
                            var existingSid = event.message.body.findValue('Session-Id');
                            var targetHost = event.message.body.findValue('Origin-Host');
                            var targetRealm = event.message.body.findValue('Origin-Realm');
                            console.log('Sending server initiated Re-Auth-Request to ' + targetHost + ' using existing Session-Id ' + existingSid);
                            var rar = connection.createRequest('Diameter Common Messages', 'Re-Auth', existingSid);
                            rar.header.flags.proxiable = true;
                            rar.body = rar.body.concat([
                                ['Origin-Host', originHost],
                                ['Origin-Realm', originRealm],
                                ['Destination-Host', targetHost],
                                ['Destination-Realm', targetRealm],
                                ['Auth-Application-Id', '3GPP Gx'],
                                ['Re-Auth-Request-Type', 'AUTHORIZE_ONLY']
                            ]);
                            connection.sendRequest(rar).then(function(raa) {
                                console.log('Got response for server initiated RAR');
                            }, function(raa_e) {
                                console.log('Error sending RAR: ' + raa_e);
                            });
                        }
                    }, 1000);
                }
*/
        }
        if ( response ) {
            if ( delayInstructions.hasOwnProperty(event.message.command) /*delayInstructions.has(event.message.command)*/ ) {
                setTimeout(() => {
                    event.callback(response);
                }, delayInstructions[event.message.command].delay /*delayInstructions.get(event.message.command).delay*/);
            } else if ( !peerMessage && argv.delay ) {
                setTimeout(() => {
                    event.callback(response);
                }, argv.delay);
            } else {
                event.callback(response);
            }
        }
    });
    socket.on('end', () => {
        sockets.delete(socket);
        //console.log('Client disconnected.');
    });
    socket.on('error', (err) => {
        console.log(`Error at ${new Date().toLocaleString('ja', { dateStyle: 'medium', timeStyle: 'medium' })}`);
        console.log(err);
    });
});
ocsServer
    .listen(argv.port, argv.listener)
    .on('listening', () => {
        console.log('OCS listening DIAMETER on ' + JSON.stringify(ocsServer.address()));
    });
if ( argv.ccrCount ) {
    setInterval(() => {
        if ( totalCcr > 0 ) {
            let elapsed = (new Date().getTime() - startTime) / 1000.0;
            console.log('CCR total: ' + totalCcr + ' elapsed: ' + elapsed + 's rate: ' + totalCcr / elapsed + ' r/s');
            //console.log(ccrs);
        }
    }, argv.ccrCount * 1000);
}
