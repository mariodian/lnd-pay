const config = {
    cert: '<base64 or hex of ~/.lnd/tls.cert>',
    macaroon: '<base64 or hex of ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon>',
    host: '127.0.0.1:10009',
    wsPort: 11337,
    apiPort: 11338,
    apiPrefix: '/api/v0',
    cors: 'http://localhost'
}

module.exports = config