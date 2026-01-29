const crypto = require('crypto');

class MoMoPayment {
    constructor(config) {
        this.partnerCode = config.partnerCode;
        this.accessKey = config.accessKey;
        this.secretKey = config.secretKey;
        this.endpoint = config.endpoint;
        this.redirectUrl = config.redirectUrl;
        this.ipnUrl = config.ipnUrl;
    }

    // Tạo chữ ký HMAC SHA256
    createSignature(rawData) {
        return crypto
            .createHmac('sha256', this.secretKey)
            .update(rawData)
            .digest('hex');
    }

    // Tạo request thanh toán MoMo
    async createPayment(orderId, amount, orderInfo, userId) {
        const requestId = `${orderId}_${Date.now()}`;
        const extraData = Buffer.from(JSON.stringify({ userId })).toString('base64');
        const requestType = 'captureWallet';

        // Tạo raw signature theo thứ tự alphabet
        const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${this.ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${this.partnerCode}&redirectUrl=${this.redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
        
        const signature = this.createSignature(rawSignature);

        const requestBody = {
            partnerCode: this.partnerCode,
            accessKey: this.accessKey,
            requestId: requestId,
            amount: amount,
            orderId: orderId,
            orderInfo: orderInfo,
            redirectUrl: this.redirectUrl,
            ipnUrl: this.ipnUrl,
            requestType: requestType,
            extraData: extraData,
            lang: 'vi',
            signature: signature
        };

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('MoMo API Error:', error);
            throw error;
        }
    }

    // Verify signature từ callback/IPN
    verifySignature(data) {
        const {
            requestId,
            orderId,
            amount,
            orderInfo,
            orderType,
            transId,
            resultCode,
            message,
            payType,
            responseTime,
            extraData,
            signature
        } = data;

        const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${this.partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
        
        const expectedSignature = this.createSignature(rawSignature);
        
        return signature === expectedSignature;
    }
}

module.exports = MoMoPayment;