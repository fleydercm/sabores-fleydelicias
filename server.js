const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config();

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const JWT_SECRET = process.env.JWT_SECRET;

if (!ADMIN_USER || !ADMIN_PASS || !JWT_SECRET) {
    console.error("🚨 ERROR CRÍTICO DE SEGURIDAD: Faltan las variables de entorno obligatorias (ADMIN_USER, ADMIN_PASS o JWT_SECRET).");
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Desactivamos CSP para evitar bloqueos con scripts/estilos en línea o CDNs de terceros
app.use(helmet({
    contentSecurityPolicy: false,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const AUDIT_FILE = path.join(__dirname, 'audit.log');
function registrarAuditoria(accion, usuario, req) {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'Desconocida';
    const logEntry = `[${timestamp}] | IP: ${ip} | Usuario: ${usuario} | Acción: ${accion}`;
    console.warn(`🚨 ALERTA DE SEGURIDAD: ${logEntry}`);
    try {
        fs.appendFileSync(AUDIT_FILE, logEntry + '\n');
    } catch (e) {
        // Ignorar error de archivo local
    }
}

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Demasiados intentos fallidos. Acceso bloqueado temporalmente por seguridad.' }
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
    usuario: ADMIN_USER,
    password: ADMIN_PASS
};

app.post('/api/login', loginLimiter, (req, res) => {
    try {
        const username = req.body.username || req.body.usuario;
        const password = req.body.password;

        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            registrarAuditoria('LOGIN_FALLIDO_DATOS_INCOMPLETOS', username || 'Anónimo', req);
            return res.status(400).json({ success: false, message: 'Faltan datos obligatorios o formato inválido' });
        }

        const usuarioValido = (username === adminConfig.usuario);

        let passwordValida = false;
        if (usuarioValido) {
            const passBuffer = Buffer.from(password);
            const expectedBuffer = Buffer.from(adminConfig.password);
            if (passBuffer.length === expectedBuffer.length) {
                passwordValida = crypto.timingSafeEqual(passBuffer, expectedBuffer);
            }
        }

        if (!usuarioValido || !passwordValida) {
            registrarAuditoria('LOGIN_FALLIDO_CREDENCIALES_INVALIDAS', username, req);
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ usuario: adminConfig.usuario }, JWT_SECRET, { expiresIn: '4h' });

        const isSecureEnv = process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';

        res.cookie('admin_session', token, {
            httpOnly: true,
            secure: isSecureEnv,
            sameSite: 'strict',
            maxAge: 4 * 60 * 60 * 1000
        });

        registrarAuditoria('LOGIN_EXITOSO', adminConfig.usuario, req);
        return res.json({ success: true, message: 'Autenticación exitosa' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error interno crítico del servidor' });
    }
});

function verificarSesionAdmin(req, res, next) {
    const token = req.cookies.admin_session;
    if (!token) {
        return res.status(403).json({ success: false, message: 'Acceso denegado: Token de sesión ausente' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.adminUser = decoded.usuario;
        next();
    } catch (err) {
        registrarAuditoria('SESION_INVALIDA_O_EXPIRADA', 'Desconocido', req);
        return res.status(403).json({ success: false, message: 'Sesión expirada o inválida. Inicie sesión nuevamente.' });
    }
}

app.post('/api/actualizar-admin', verificarSesionAdmin, (req, res) => {
    const usuario = req.body.username || req.body.usuario;
    const password = req.body.password;
    if (!usuario || !password) {
        return res.status(400).json({ success: false, message: 'Faltan datos' });
    }
    try {
        adminConfig.usuario = usuario;
        adminConfig.password = password;
        registrarAuditoria('ACTUALIZACION_CREDENCIALES_ADMIN', req.adminUser, req);
        res.json({ success: true, message: 'Credenciales corporativas actualizadas correctamente' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error al actualizar credenciales' });
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
        cb(new Error('Formato de imagen no permitido'));
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
        res.status(500).json({ success: false, message: 'Error interno al registrar el pedido' });
    }
});

app.put('/api/pedidos/:id', verificarSesionAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pedidos = leerPedidos();
        const idx = pedidos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });

        pedidos[idx] = { ...pedidos[idx], ...req.body };
        guardarPedidos(pedidos);
        registrarAuditoria(`MODIFICAR_PEDIDO_${id}`, req.adminUser, req);
        res.json({ success: true, pedido: pedidos[idx] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

app.delete('/api/pedidos/:id', verificarSesionAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let pedidos = leerPedidos();
        const filtrados = pedidos.filter(p => p.id !== id);
        if (filtrados.length === pedidos.length) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });

        guardarPedidos(filtrados);
        registrarAuditoria(`ELIMINAR_PEDIDO_${id}`, req.adminUser, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor de Grado Empresarial activo en puerto ${PORT}`);
});s