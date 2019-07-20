"use strict";

process.title = 'node-lnd-pay';
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';

const {log} = console;
const cfg = require('./config');

const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const {authenticatedLndGrpc} = require('ln-service');
const {subscribeToInvoices} = require('ln-service');
const {invoicesRouter} = require('ln-service/routers');

const wss = new WebSocket.Server({ port: cfg.wsPort });
const app = express();
const {lnd} = authenticatedLndGrpc({
    cert: cfg.cert,
    macaroon: cfg.macaroon,
    socket: cfg.host
});

// Helpers
const msg = (msg) => {
    return console.log(`${new Date()} ${msg}`);
}

// Websocket
wss.on('connection', (ws, req) => {
    const ip = req.connection.remoteAddress;

    msg(`Server is listening on port ${cfg.wsPort}`);
    msg(`${ip} connected`);

    ws.on('message', (resInvoice) => {
        msg(`Subscribing to invoice ${resInvoice}`);

        const sub = subscribeToInvoices({lnd});

        sub.on('invoice_updated', invoice => {
            if (resInvoice === invoice.id) {
                const res = JSON.stringify(invoice);

                msg(res);
                ws.send(res);
            }
        });
    
        sub.on('error', (err) => {
            msg(`ERR: ${err}`);
        });
    });

    ws.on('close', () => {
        msg(`Peer ${ip} disconnected.`);
    });
});

// API
app.use(cors({
    origin: cfg.cors
}));
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true }));
app.use(`${cfg.apiPrefix}/invoices`, invoicesRouter({lnd, log}));

app.listen(cfg.apiPort);
