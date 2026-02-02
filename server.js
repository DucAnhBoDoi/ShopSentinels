require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const connectDB = require('./db');
const User = require('./User');
const MoMoPayment = require('./momoPayment');
const bcrypt = require('bcryptjs');

const app = express();

// Kết nối MongoDB
connectDB();

// Khởi tạo MoMo Payment
const momoPayment = new MoMoPayment({
    partnerCode: process.env.MOMO_PARTNER_CODE,
    accessKey: process.env.MOMO_ACCESS_KEY,
    secretKey: process.env.MOMO_SECRET_KEY,
    endpoint: process.env.MOMO_ENDPOINT,
    redirectUrl: process.env.MOMO_REDIRECT_URL,
    ipnUrl: process.env.MOMO_IPN_URL
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'sentinels-game-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 giờ
}));

// Middleware để cập nhật session user từ DB
app.use(async (req, res, next) => {
    if (req.session.userId) {
        try {
            const user = await User.findById(req.session.userId);
            if (user) {
                req.session.user = {
                    _id: user._id.toString(),
                    username: user.username,
                    coin: user.coin
                };
            }
        } catch (error) {
            console.error('Error updating session:', error);
        }
    }
    next();
});

// --- ROUTES ---

// ============================================================
// 1. Trang Chủ (Shop) - ĐÃ CẬP NHẬT AUTO LOGIN TỪ UNITY
// ============================================================
app.get('/', async (req, res) => {
    try {
        // --- LOGIC AUTO LOGIN (NHẬN DIỆN NGƯỜI DÙNG TỪ UNITY) ---
        const quickLoginId = req.query.quickLogin;

        if (quickLoginId) {
            // Tìm user dựa trên ID được gửi từ Unity
            const user = await User.findById(quickLoginId);
            if (user) {
                // Tự động Đăng nhập (Lưu vào Session)
                req.session.userId = user._id.toString();
                req.session.user = {
                    _id: user._id.toString(),
                    username: user.username,
                    coin: user.coin
                };
                console.log(`[Auto Login] Unity User ${user.username} đã tự động đăng nhập.`);
                
                // Redirect về trang chủ để xóa ?quickLogin trên thanh địa chỉ nhìn cho đẹp
                return res.redirect('/'); 
            }
        }

        // --- RENDER GIAO DIỆN ---
        // Lấy thông tin user từ session (nếu đã đăng nhập)
        const user = req.session.user || null;
        res.render('shop', { user });

    } catch (error) {
        console.error('Home Page Error:', error);
        res.render('shop', { user: null });
    }
});

// ============================================================

// 2. Trang Đăng nhập/Đăng ký
app.get('/login', (req, res) => {
    const message = req.query.msg || req.query.error || null;
    const messageType = req.query.msg ? 'success' : 'error';
    res.render('login', { message, messageType });
});

// 3. Xử lý Đăng Ký (WEB) - ĐÃ TÍCH HỢP BCRYPT
app.post('/register', async (req, res) => {
    try {
        const { username, password, passwordConfirm } = req.body;
        
        // Kiểm tra mật khẩu khớp
        if (password !== passwordConfirm) {
            return res.redirect('/login?error=Mật khẩu xác nhận không khớp!');
        }
        
        // Kiểm tra độ dài mật khẩu
        if (password.length < 3) {
            return res.redirect('/login?error=Mật khẩu phải có ít nhất 3 ký tự!');
        }
        
        // Kiểm tra độ dài username
        if (username.length < 3) {
            return res.redirect('/login?error=Tên tài khoản phải có ít nhất 3 ký tự!');
        }
        
        // Kiểm tra username đã tồn tại chưa
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.redirect('/login?error=Tên tài khoản đã tồn tại!');
        }
        
        // --- BẮT ĐẦU MÃ HÓA PASSWORD ---
        const salt = await bcrypt.genSalt(10); // Tạo muối
        const hashedPassword = await bcrypt.hash(password, salt); // Mã hóa
        
        // Tạo user mới với password đã mã hóa
        const newUser = new User({ 
            username, 
            password: hashedPassword, // Lưu hash, không lưu plain text
            coin: 0 
        });
        
        await newUser.save();
        
        console.log(`[Register] User mới: ${username} (Đã mã hóa pass)`);
        res.redirect('/login?msg=Đăng ký thành công! Mời đăng nhập.');
    } catch (error) {
        console.error('Register error:', error);
        
        // Xử lý lỗi validation từ Mongoose
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.redirect(`/login?error=${encodeURIComponent(messages.join(', '))}`);
        }
        
        res.redirect('/login?error=Có lỗi xảy ra, vui lòng thử lại!');
    }
});

// 4. Xử lý Đăng Nhập (WEB) - ĐÃ TÍCH HỢP BCRYPT
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 1. Tìm user theo username
        const user = await User.findOne({ username });
        
        if (user) {
            // 2. So sánh mật khẩu nhập vào (plain) với mật khẩu trong DB (hash)
            const isMatch = await bcrypt.compare(password, user.password);

            if (isMatch) {
                // Đăng nhập thành công -> Lưu session
                req.session.userId = user._id.toString();
                req.session.user = {
                    _id: user._id.toString(),
                    username: user.username,
                    coin: user.coin
                };
                console.log(`[Login] User ${username} đã đăng nhập`);
                return res.redirect('/');
            }
        }
        
        // Nếu không tìm thấy user hoặc mật khẩu sai
        res.redirect('/login?error=Sai tên đăng nhập hoặc mật khẩu!');
        
    } catch (error) {
        console.error('Login error:', error);
        res.redirect('/login?error=Có lỗi xảy ra, vui lòng thử lại!');
    }
});

// 5. Xử lý Đăng Xuất
app.get('/logout', (req, res) => {
    const username = req.session.user?.username;
    req.session.destroy();
    console.log(`[Logout] User ${username} đã đăng xuất`);
    res.redirect('/');
});

// 6. Xử lý Mua - Tạo payment request với MoMo
app.post('/buy', async (req, res) => {
    try {
        const { userId, coinAmount, price } = req.body;
        
        if (!req.session.user || req.session.user._id !== userId) {
            return res.redirect('/login?error=Vui lòng đăng nhập!');
        }
        
        // Tạo orderId unique
        const orderId = `SENTINELS_${userId}_${Date.now()}`;
        const orderInfo = `Nạp ${coinAmount} coins`;
        const amount = parseInt(price);
        
        // Gọi MoMo API
        const paymentData = await momoPayment.createPayment(
            orderId,
            amount,
            orderInfo,
            userId
        );
        
        if (paymentData.resultCode === 0) {
            // Lưu thông tin đơn hàng vào session để verify sau
            req.session.pendingOrder = {
                orderId,
                userId,
                coinAmount: parseInt(coinAmount),
                price: amount
            };
            
            console.log(`[Payment] User ${req.session.user.username} tạo đơn: ${orderId} - ${coinAmount} coins - ${amount.toLocaleString()} VNĐ`);
            
            // Redirect đến trang thanh toán MoMo
            res.redirect(paymentData.payUrl);
        } else {
            console.error('MoMo Error:', paymentData);
            res.redirect('/?error=Không thể tạo thanh toán, vui lòng thử lại!');
        }
    } catch (error) {
        console.error('Buy error:', error);
        res.redirect('/?error=Có lỗi xảy ra, vui lòng thử lại!');
    }
});

// 7. MoMo Callback - Xử lý kết quả thanh toán
app.get('/payment/momo/callback', async (req, res) => {
    try {
        const {
            orderId,
            resultCode,
            message,
            amount,
            transId,
            signature,
            extraData
        } = req.query;
        
        console.log('[MoMo Callback]', { orderId, resultCode, message, transId });
        
        // Verify signature
        const isValid = momoPayment.verifySignature(req.query);
        
        if (!isValid) {
            console.error('[MoMo] Invalid signature!');
            return res.redirect('/?error=Xác thực thanh toán thất bại!');
        }
        
        // Kiểm tra kết quả thanh toán
        if (resultCode === '0') {
            // Thanh toán thành công
            const pendingOrder = req.session.pendingOrder;
            
            if (pendingOrder && pendingOrder.orderId === orderId) {
                // Cập nhật coin cho user
                const user = await User.findById(pendingOrder.userId);
                
                if (user) {
                    user.coin += pendingOrder.coinAmount;
                    await user.save();
                    
                    // Cập nhật session
                    req.session.user.coin = user.coin;
                    
                    console.log(`[Payment Success] User: ${user.username} | +${pendingOrder.coinAmount} Coin | Tổng: ${user.coin} Coin | TransID: ${transId}`);
                    
                    // Xóa pending order
                    delete req.session.pendingOrder;
                    
                    return res.redirect('/?success=Nạp coin thành công!');
                }
            }
            
            res.redirect('/?error=Không tìm thấy đơn hàng!');
        } else {
            // Thanh toán thất bại
            console.log(`[Payment Failed] OrderID: ${orderId} | Message: ${message}`);
            delete req.session.pendingOrder;
            res.redirect(`/?error=Thanh toán thất bại: ${message}`);
        }
    } catch (error) {
        console.error('Callback error:', error);
        res.redirect('/?error=Có lỗi xảy ra!');
    }
});

// 8. MoMo IPN - Nhận thông báo từ MoMo server
app.post('/payment/momo/ipn', async (req, res) => {
    try {
        const {
            orderId,
            resultCode,
            amount,
            transId,
            extraData
        } = req.body;
        
        console.log('[MoMo IPN]', { orderId, resultCode, transId });
        
        // Verify signature
        const isValid = momoPayment.verifySignature(req.body);
        
        if (!isValid) {
            console.error('[MoMo IPN] Invalid signature!');
            return res.status(400).json({ message: 'Invalid signature' });
        }
        
        if (resultCode === 0) {
            // Decode extraData để lấy userId
            const decoded = JSON.parse(Buffer.from(extraData, 'base64').toString());
            console.log('[MoMo IPN] Payment confirmed for user:', decoded.userId);
            
            // Có thể thêm logic backup ở đây nếu callback không hoạt động
        }
        
        // Phản hồi cho MoMo
        res.status(200).json({ message: 'OK' });
    } catch (error) {
        console.error('IPN error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 9. API - Xem danh sách user (để test)
app.get('/api/users', async (req, res) => {
    try {
        // Chỉ lấy username, coin, createdAt - KHÔNG LẤY PASSWORD
        const users = await User.find({}, 'username coin createdAt');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- API CHO UNITY ---

// 1. API Đăng nhập (UNITY) - ĐÃ TÍCH HỢP BCRYPT
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 1. Tìm user bằng username
        const user = await User.findOne({ username });
        
        if (user) {
            // 2. So sánh mật khẩu bằng bcrypt
            const isMatch = await bcrypt.compare(password, user.password);

            if (isMatch) {
                // Trả về dữ liệu User nếu đúng pass
                return res.status(200).json({
                    success: true,
                    message: "Đăng nhập thành công",
                    data: {
                        _id: user._id,
                        username: user.username,
                        coin: user.coin
                    }
                });
            }
        }
        
        // Nếu không tìm thấy hoặc sai pass
        res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. API Đăng ký (UNITY) - ĐÃ TÍCH HỢP BCRYPT
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, passwordConfirm } = req.body;

        if (password !== passwordConfirm) {
            return res.status(400).json({ success: false, message: "Mật khẩu xác nhận không khớp" });
        }
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Tài khoản đã tồn tại" });
        }

        // --- MÃ HÓA PASS ---
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Lưu user với pass đã mã hóa
        const newUser = new User({ 
            username, 
            password: hashedPassword, 
            coin: 0 
        });
        await newUser.save();

        res.status(200).json({
            success: true,
            message: "Đăng ký thành công",
            data: {
                _id: newUser._id,
                username: newUser.username,
                coin: newUser.coin
            }
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. API Lấy thông tin User mới nhất
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (user) {
            res.status(200).json({
                success: true,
                data: {
                    _id: user._id,
                    username: user.username,
                    coin: user.coin
                }
            });
        } else {
            res.status(404).json({ success: false, message: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🎮 SENTINELS SHOP SERVER (With BCrypt Security)');
    console.log('='.repeat(50));
    console.log(`✅ Server đang chạy: http://localhost:${PORT}`);
    console.log(`📝 Xem users: http://localhost:${PORT}/api/users`);
    console.log(`💳 MoMo Sandbox: ${process.env.MOMO_PARTNER_CODE ? 'Đã cấu hình' : 'Chưa cấu hình'}`);
    console.log('='.repeat(50));
});