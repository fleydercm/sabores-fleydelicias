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

// --- CONFIGURACIÓN DE CREDENCIALES EMPRESARIALES ---
const ADMIN_USER = process.env.ADMIN_USER || 'fleydelicias26';
const ADMIN_PASS = process.env.ADMIN_PASS || '311334FCM';
const JWT_SECRET = process.env.JWT_SECRET || 'clave_jwt_super_segura_fleydelicias_enterprise_2026';

const app = express();
const PORT = process.env.PORT || 3000;

// Confiar en el proxy de la nube (Requerido para Render / Nginx / AWS)
app.set('trust proxy', 1);

// Helmet con Content Security Policy (CSP) estricta contra XSS
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.tailwindcss.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- SISTEMA DE AUDITORÍA (Audit Trail Corporativo) ---
const AUDIT_FILE = path.join(__dirname, 'audit.log');
function registrarAuditoria(accion, usuario, req) {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'Desconocida';
    const logEntry = `[${timestamp}] | IP: ${ip} | Usuario: ${usuario} | Acción: ${accion}\n`;
    try {
        fs.appendFileSync(AUDIT_FILE, logEntry);
    } catch (e) {
        console.error('Error al escribir en el registro de auditoría:', e);
    }
}

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Protección estricta contra fuerza bruta en el inicio de sesión
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5,                   // Máximo 5 intentos fallidos
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

// Estado del administrador en memoria (permite actualizaciones en caliente)
let adminConfig = {
    usuario: ADMIN_USER,
    password: ADMIN_PASS
};

// --- RUTA DE LOGIN EMPRESARIAL ---
app.post('/api/login', loginLimiter, (req, res) => {
    try {
        const username = req.body.username || req.body.usuario;
        const password = req.body.password;

        if (!username || !password) {
            registrarAuditoria('LOGIN_FALLIDO_DATOS_INCOMPLETOS', username || 'Anónimo', req);
            return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
        }

        // Validación de usuario
        const usuarioValido = (username === adminConfig.usuario);

        // Validación de contraseña resistente a Timing Attacks (Ataques de tiempo)
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

        // Generación de Token JWT Único con expiración estricta de 4 horas
        const token = jwt.sign({ usuario: adminConfig.usuario }, JWT_SECRET, { expiresIn: '4h' });

        // Cookie de Nivel Bancario: HttpOnly + Secure + SameSite Strict
        res.cookie('admin_session', token, {
            httpOnly: true,         // Inaccesible para JavaScript del navegador (Protege contra XSS)
            secure: true,           // Obliga a viajar solo por HTTPS cifrado
            sameSite: 'strict',     // Bloquea completamente ataques CSRF de sitios externos
            maxAge: 4 * 60 * 60 * 1000 // Caduca exactamente en 4 horas
        });

        registrarAuditoria('LOGIN_EXITOSO', adminConfig.usuario, req);
        return res.json({ success: true, message: 'Autenticación exitosa' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error interno crítico del servidor' });
    }
});

// --- MIDDLEWARE DE AUTENTICACIÓN JWT ---
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

// Ruta para actualizar credenciales de administrador de forma segura
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

// Configuración segura de subida de archivos (Comprobantes de pago)
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
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite estricto de 5 MB por archivo
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
    const id = parseInt(req.params.id);
    const pedidos = leerPedidos();
    const idx = pedidos.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });

    pedidos[idx] = { ...pedidos[idx], ...req.body };
    guardarPedidos(pedidos);
    registrarAuditoria(`MODIFICAR_PEDIDO_${id}`, req.adminUser, req);
    res.json({ success: true, pedido: pedidos[idx] });
});

app.delete('/api/pedidos/:id', verificarSesionAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    let pedidos = leerPedidos();
    const filtrados = pedidos.filter(p => p.id !== id);
    if (filtrados.length === pedidos.length) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });

    guardarPedidos(filtrados);
    registrarAuditoria(`ELIMINAR_PEDIDO_${id}`, req.adminUser, req);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Servidor de Grado Empresarial activo en puerto ${PORT}`);
});