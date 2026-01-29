const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    password: {
        type: String,
        required: true,
        minlength: 3
    },
    coin: {
        type: Number,
        default: 0,
        min: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    // Danh sách vật phẩm đã mua (để sau này mở rộng)
    inventory: [{
        itemId: String,
        itemName: String,
        purchasedAt: {
            type: Date,
            default: Date.now
        }
    }]
});

module.exports = mongoose.model('User', userSchema);