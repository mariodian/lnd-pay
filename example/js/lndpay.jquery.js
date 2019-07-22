"use strict";

(function($) {
    window.WebSocket = window.WebSocket || window.MozWebSocket;

    Date.prototype.addMinutes = function(h) {
        this.setTime(this.getTime() + (h*60*1000));
        return this;
    }

    $.fn.lndPay = function(options) {
        const defaults = {
            apiURL: null,           // API URL prefix to create invoice
            wsURL: null,            // WebSocket url
            amount: null,           // Invoice amount
            description: '',        // Invoice description
            expire: 60,             // Invoice expires in X minutes
            namespace: 'lndpay',    // HTML lass namespace
            buildUI: true,          // Build UI
            onCreateInvoice: null,  // Callback when invoice get created (overwrites default)
            onPaid: null            // Callback on successful payment (overwrites default)
        };
        let settings = $.extend({}, defaults, options);
        let self = this;
        let ns = settings.namespace + '-';

        let $form = null;
        let $amount = null;
        let $description = null;
        let $pay = null;
        let $payReq = null;
        let $qr = null;

        if (this.length > 1) {
            this.each(function() { $(this).pluginName(options) });
            return this;
        }

        this.init = function() {
            if (settings.apiURL === null || settings.wsURL === null) {
                throw new Error('API and WebSocket URL must be provided.');
            }

            if (settings.buildUI) {
                this.buildUI();
            }

            $amount = $('#' + ns + 'amount');
            $description = $('#' + ns + 'description');
            $payReq = $('#' + ns + 'pay_req');
            $pay = $('#' + ns + 'pay');

            $pay.click(function(event){
                event.preventDefault();
                self.createInvoice();
            });

            $('#' + ns + 'show_qr').click(function(event){
                event.preventDefault();
                self.toggleQR();
            });

            $('#' + ns + 'copy_pay_req').click(function(event){
                event.preventDefault();
                self.copyPayReq(this);
            });
            

            return this;
        };

        this.buildUI = function() {
            const html = '<div class="input-group mb-2">' + 
            (settings.amount === null 
                ? '<input type="text" class="form-control form-control-sm" id="' + ns + 'amount" placeholder="Enter amount in sats">' 
                : '') +
            (settings.description === '' 
                ? '<input type="text" class="form-control form-control-sm" id="' + ns + 'description" placeholder="Enter payment\'s description">' 
                : '') + 
            '</div>' + 
            '<div class="input-group mb-3">' + 
            '<input type="text" readonly class="form-control form-control-sm" id="' + ns + 'pay_req" placeholder="Payment request">' + 
            '<div class="input-group-append">' + 
            '<a id="' + ns + 'copy_pay_req" href="#" class="btn btn-secondary btn-sm"><i class="fa fa-copy"></i><span class="text"></span></a>' + 
            '<a id="' + ns + 'show_qr" href="#" class="btn btn-secondary btn-sm"><i class="fa fa-qrcode"></i></a>' + 
            '<a id="' + ns + 'pay" href="#" class="btn btn-warning btn-sm"><i class="fa fa-bolt fa-fw mr-1"></i> Pay</a>' + 
            '</div>' +
            '</div>';

            $(this).html('<form />');
            $form = $(this).find('form');
            $form.html(html);
        }

        this.createInvoice = function(options) {
            if (options) {
                settings = $.extend({}, settings, options);
            }

            let amount = $amount.val() || settings.amount;
            let description = $description.val() || settings.description;

            if (amount === null) {
                amount = $amount.val(0);
            }

            $payReq.attr('placeholder', 'Please wait...');

            $.ajax({
                method: 'POST',
                url: settings.apiURL + '/invoices',
                dataType: 'json',
                data: {
                    tokens: parseInt(amount),
                    description: description,
                    expires_at: new Date().addMinutes(settings.expire).toISOString()
                },
    
                success: function(res) {
                    // A custom callback
                    if (settings.onCreateInvoice !== null) {
                        settings.onCreateInvoice(self, res);

                        // End here on custom UI
                        if (!settings.buildUI) {
                            return;
                        }
                    }

                    const paymentRequest = res.request;

                    $payReq.val(paymentRequest);

                    self.createQR(paymentRequest);
                    self.openWebSocket(res.id);
                }
            });
        }

        this.createQR = function(payReq) {
            if (typeof kjua != 'undefined') {
                if ($qr === null && settings.buildUI) {
                    $form.append('<div id="' + ns + 'qr" class="qr-wrapper text-center mt-3" />');
                }

                const paymentRequest = 'lightning:' + payReq.toUpperCase();
                const qr = kjua({
                    back: 'rgb(250, 250, 250)', 
                    rounded: 100, 
                    size: 300, 
                    quiet: 1, 
                    text: paymentRequest,
                });

                // Create a clickable payment QR code
                $qr = $('#' + ns + 'qr');

                $qr.html(qr);
                $qr.find('img').wrap('<a href="' + paymentRequest + '"></a>');

                // Show QR code if user has opened it before or on custom UI
                if (localStorage.showQR || !settings.buildUI) {
                    $qr.show();
                }
            }
        }

        this.openWebSocket = function(invoiceId, options) {
            if (typeof options === 'object') {
                settings = $.extend({}, settings, options);
            }

            let con = new WebSocket(settings.wsURL);
            con.onopen = function () {
                // Send invoice ID to server so it only checks for particular invoice status
                if (invoiceId) {
                    con.send(invoiceId)
                } else {
                    con.close();
                }
            };

            con.onerror = function (error) {
            // an error occurred when sending/receiving data
            };

            con.onmessage = function (message) {
                let json;
                try {
                    json = JSON.parse(message.data);
                } catch (e) {
                    console.log('This doesn\'t look like a valid JSON: ', message.data);
                    return;
                }

                // Invoice paid
                if (json.is_confirmed) {
                    // A custom callback
                    if (settings.onPaid !== null) {
                        settings.onPaid(self, json);

                        // End here on custom UI
                        if (!settings.buildUI) {
                            return;
                        }
                    }

                    if (typeof kjua != 'undefined') {
                        const html = '<div class="qr-overlay text-white">' + 
                        '<div class="qr-overlay-wrapper">' + 
                        '<p><i class="fa fa-check-circle fa-8x fa-fw text-warning"></i></p>' + 
                        '<p>Thank you for your payment!</p>' + 
                        '</div>' +
                        '</div>';

                        $qr.prepend(html);
                    } else {
                        $(self).append('<p>Invoice paid. Thank you!</p>');
                    }
                } else {
                    // Invoice not paid
                }
            };
        }

        this.toggleQR = function() {
            $qr && $qr.slideToggle(300);

            return localStorage.showQR = !localStorage.showQR ? true : '';
        }

        this.copyPayReq = function(self) {
            // Nothing to copy
            if (!$payReq.val()) {
                return;
            }

            const iosDevice = /ipad|iphone|ipod/i;

            if (navigator.userAgent.match(iosDevice)) {
                const el = document.querySelector('#' + ns + 'pay_req');
                const isEditable = el.contentEditable;
                const isReadOnly = el.readOnly;

                el.contentEditable = true;
                el.readOnly = true;

                const range = document.createRange();

                range.selectNodeContents(el);

                const selection = window.getSelection();

                selection.removeAllRanges();
                selection.addRange(range);

                el.setSelectionRange(0, 999999);

                el.contentEditable = isEditable;
                el.readOnly = isReadOnly;
            } else {
                $payReq.select();
            }

            document.execCommand('copy');

            const copyText = $(self).find('.text');

            copyText.prop('hidden', false).text(' Copied!');

            return setTimeout(function(){
                copyText.text('');
            }, 1000);
        }

        return this.init();
    }
})(jQuery);