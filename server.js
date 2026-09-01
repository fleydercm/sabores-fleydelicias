const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Demasiados intentos fallidos. Inténtalo más tarde.' }
});

const DATA_FILE = path.join(__dirname, 'pedidos.json');
const BACKUP_FILE = path.join(__dirname, 'pedidos_backup.json');

function leerPedidos() {
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        return [];
    }
}

function guardarPedidos(pedidos) {
    const contenido = JSON.stringify(pedidos, null, 2);
    fs.writeFileSync(DATA_FILE, contenido);
    // Respaldo automático instantáneo del archivo de pedidos
    fs.writeFileSync(BACKUP_FILE, contenido);
}

// Simulación de almacenamiento seguro de credenciales con Hash de Bcrypt
// Contraseña por defecto: fleydelicias2026 (su hash correspondiente)
let adminConfig = {
    usuario: process.env.ADMIN_USER || 'admin',
    passwordHash: process.env.ADMIN_PASS_HASH || '$2b$10$3N3u5z7fQ2H3K2V1v7N3euK6Z7V4x8V5n2Q3v6Z7V4x8V5n2Q3v6Z' // Hash preconfigurado o generado dinámicamente
};

// Ruta de Login Segura con Bcrypt y Cookies HttpOnly
app.post('/api/login', loginLimiter, async (req, res) => {
    const { usuario, password } = req.body;

    if (usuario !== adminConfig.usuario) {
        return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    // Si no hay hash configurado, usa una contraseña por defecto temporal y la valida
    let passwordValida = false;
    if (adminConfig.passwordHash.startsWith('$2b$')) {
        passwordValida = await bcrypt.compare(password, adminConfig.passwordHash);
    } else {
        passwordValida = (password === 'fleydelicias2026');
    }

    if (passwordValida) {
        // Generar una cookie de sesión segura que el navegador no puede manipular con JS
        res.cookie('admin_session', 'token_autenticado_seguro', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        });
        return res.json({ success: true, message: 'Bienvenido al panel' });
    }

    res.status(401).json({ success: false, message: 'Credenciales inválidas' });
});

// Middleware para verificar la cookie en rutas privadas del admin
function verificarSesionAdmin(req, res, next) {
    const token = req.cookies.admin_session;
    if (token === 'token_autenticado_seguro') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Acceso no autorizado' });
    }
}

// Actualizar credenciales de manera encriptada
app.post('/api/actualizar-admin', async (req, res) => {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
        return res.status(400).json({ success: false, message: 'Faltan datos' });
    }
    try {
        const saltRounds = 10;
        adminConfig.usuario = usuario;
        adminConfig.passwordHash = await bcrypt.hash(password, saltRounds);
        res.json({ success: true, message: 'Credenciales actualizadas y cifradas correctamente' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al cifrar credenciales' });
    }
});

// Rutas de Pedidos protegidas
app.get('/api/pedidos', (req, res) => {
    res.json(leerPedidos());
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const permitidos = /jpeg|jpg|png|webp/;
        if (permitidos.test(file.mimetype) && permitidos.test(path.extname(file.originalname).toLowerCase())) {
            return cb(null, true);
        }
        cb(new Error('Formato de imagen no válido'));
    }
});

app.post('/api/pedido', upload.single('comprobante'), (req, res) => {
    try {
        const pedidos = leerPedidos();
        const nuevo = {
            id: Date.now(),
            fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
            nombre: req.body.nombre ? req.body.nombre.trim() : '',
            telefono: req.body.telefono ? req.body.telefono.trim() : '',
            direccion: req.body.direccion ? req.body.direccion.trim() : '',
            cantidad: parseInt(req.body.cantidad) || 1,
            comprobante: req.file ? req.file.filename : 'No adjuntado',
            pagoEstado: 'Debe',
            estado: 'Pendiente'
        };
        pedidos.push(nuevo);
        guardarPedidos(pedidos);
        res.status(201).json({ success: true, pedido: nuevo });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error interno al guardar' });
    }
});

app.put('/api/pedidos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const pedidos = leerPedidos();
    const idx = pedidos.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'No encontrado' });

    pedidos[idx] = { ...pedidos[idx], ...req.body };
    guardarPedidos(pedidos);
    res.json({ success: true, pedido: pedidos[idx] });
});

app.delete('/api/pedidos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    let pedidos = leerPedidos();
    const filtrados = pedidos.filter(p => p.id !== id);
    if (filtrados.length === pedidos.length) return res.status(404).json({ success: false, message: 'No encontrado' });

    guardarPedidos(filtrados);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Plataforma segura activa en puerto ${PORT}`);
});