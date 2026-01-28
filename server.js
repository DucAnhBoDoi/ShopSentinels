const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session middleware
app.use(session({
    secret: 'sentinels-game-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 giờ
}));

// --- DỮ LIỆU GIẢ LẬP ---
let users = []; 

// --- ROUTES ---

// 1. Trang Chủ (Shop)
app.get('/', (req, res) => {
    const user = req.session.user || null;
    res.render('shop', { user });
});

// 2. Trang Đăng nhập/Đăng ký
app.get('/login', (req, res) => {
    const message = req.query.msg || req.query.error || null;
    const messageType = req.query.msg ? 'success' : 'error';
    res.render('login', { message, messageType });
});

// 3. Xử lý Đăng Ký
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    // Kiểm tra username đã tồn tại chưa
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
        return res.redirect('/login?error=Tên tài khoản đã tồn tại!');
    }
    
    // Tạo user mới
    const newUser = { 
        _id: Date.now().toString(), 
        username, 
        password, 
        coin: 0 
    };
    users.push(newUser);
    
    console.log(`[Register] User mới: ${username}`);
    res.redirect('/login?msg=Đăng ký thành công! Mời đăng nhập.');
});

// 4. Xử lý Đăng Nhập
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        // Lưu user vào session
        req.session.user = user;
        console.log(`[Login] User ${username} đã đăng nhập`);
        res.redirect('/');
    } else {
        res.redirect('/login?error=Sai tên đăng nhập hoặc mật khẩu!');
    }
});

// 5. Xử lý Đăng Xuất
app.get('/logout', (req, res) => {
    const username = req.session.user?.username;
    req.session.destroy();
    console.log(`[Logout] User ${username} đã đăng xuất`);
    res.redirect('/');
});

// 6. Xử lý Mua (Giả lập thanh toán)
app.post('/buy', (req, res) => {
    const { userId, coinAmount, price } = req.body;
    
    // Tìm user trong database giả lập
    const user = users.find(u => u._id === userId);
    
    if (user) {
        const coins = parseInt(coinAmount);
        const amount = parseInt(price);
        
        // Cộng coin cho user
        user.coin += coins;
        
        // Cập nhật session
        if (req.session.user && req.session.user._id === userId) {
            req.session.user.coin = user.coin;
        }
        
        console.log(`[Bill] User: ${user.username} | Nạp: ${coins} Coin | Giá: ${amount.toLocaleString()} VNĐ | Tổng Coin: ${user.coin}`);
    }
    
    res.redirect('/');
});

// 7. API - Xem danh sách user (để test)
app.get('/api/users', (req, res) => {
    res.json(users.map(u => ({ 
        username: u.username, 
        coin: u.coin 
    })));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🎮 SENTINELS SHOP SERVER');
    console.log('='.repeat(50));
    console.log(`✅ Server đang chạy: http://localhost:${PORT}`);
    console.log(`📝 Xem users: http://localhost:${PORT}/api/users`);
    console.log('='.repeat(50));
});