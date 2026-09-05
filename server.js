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

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    fs.writeFileSync(BACKUP_FILE, contenido);
}

let adminConfig = {
    usuario: process.env.ADMIN_USER || 'admin',
    passwordHash: process.env.ADMIN_PASS_HASH || '$2b$10$3N3u5z7fQ2H3K2V1v7N3euK6Z7V4x8V5n2Q3v6Z7V4x8V5n2Q3v6Z'
};

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const username = req.body.username || req.body.usuario;
        const password = req.body.password;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Faltan datos' });
        }

        if (username !== adminConfig.usuario) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        let passwordValida = false;
        if (adminConfig.passwordHash && adminConfig.passwordHash.startsWith('$2b$')) {
            try {
                passwordValida = await bcrypt.compare(password, adminConfig.passwordHash);
            } catch (e) {
                passwordValida = false;
            }
        }

        if (!passwordValida) {
            const passwordPlano = process.env.ADMIN_PASS || '311334FCM';
            passwordValida = (password === passwordPlano);
        }

        if (passwordValida) {
            res.cookie('admin_session', 'token_autenticado_seguro', {
                httpOnly: true,
                secure: false, 
                sameSite: 'lax',
                maxAge: 8 * 60 * 60 * 1000
            });
            return res.json({ success: true, message: 'Bienvenido al panel' });
        }

        return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

function verificarSesionAdmin(req, res, next) {
    const token = req.cookies.admin_session;
    if (token === 'token_autenticado_seguro') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Acceso no autorizado' });
    }
}

app.post('/api/actualizar-admin', verificarSesionAdmin, async (req, res) => {
    const usuario = req.body.username || req.body.usuario;
    const password = req.body.password;
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

app.get('/api/pedidos', verificarSesionAdmin, (req, res) => {
    res.json(leerPedidos());
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
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

app.put('/api/pedidos/:id', verificarSesionAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const pedidos = leerPedidos();
    const idx = pedidos.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'No encontrado' });

    pedidos[idx] = { ...pedidos[idx], ...req.body };
    guardarPedidos(pedidos);
    res.json({ success: true, pedido: pedidos[idx] });
});

app.delete('/api/pedidos/:id', verificarSesionAdmin, (req, res) => {
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