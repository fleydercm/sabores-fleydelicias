const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Proteger cabeceras HTTP con Helmet
app.use(helmet({
    contentSecurityPolicy: false, // Permitir carga de scripts/CDNs externos como Tailwind
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // O tu carpeta de archivos estáticos

// 2. Limitar intentos de inicio de sesión (Fuerza Bruta)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Máximo 5 intentos fallidos por IP
    message: { success: false, message: 'Demasiados intentos fallidos. Inténtalo más tarde.' }
});

// Configuración de Multer para imágenes de pago con validación de tipo
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.existsSync(path.join(__dirname, 'public')) || fs.mkdirSync(path.join(__dirname, 'public'));
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetypes = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetypes && extname) {
            return cb(null, true);
        }
        cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, WEBP)'));
    }
});

// Archivo de base de datos JSON
const DATA_FILE = path.join(__dirname, 'pedidos.json');

function leerPedidos() {
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function guardarPedidos(pedidos) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(pedidos, null, 2));
}

// Ruta de Autenticación Segura (Valida contra variables de entorno)
app.post('/api/login', loginLimiter, (req, res) => {
    const { usuario, password } = req.body;
    
    // Credenciales por defecto o tomadas de variables de entorno seguras de Render
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'fleydelicias2026';

    if (usuario === adminUser && password === adminPass) {
        res.json({ success: true, message: 'Autenticación exitosa' });
    } else {
        res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }
});

// Rutas de Pedidos
app.get('/api/pedidos', (req, res) => {
    const pedidos = leerPedidos();
    res.json(pedidos);
});

app.post('/api/pedido', upload.single('comprobante'), (req, res) => {
    try {
        const pedidos = leerPedidos();
        const nuevoPedido = {
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

        pedidos.push(nuevoPedido);
        guardarPedidos(pedidos);
        res.status(201).json({ success: true, pedido: nuevoPedido });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al procesar el pedido' });
    }
});

app.put('/api/pedidos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const pedidos = leerPedidos();
    const index = pedidos.findIndex(p => p.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    }

    pedidos[index] = { ...pedidos[index], ...req.body };
    guardarPedidos(pedidos);
    res.json({ success: true, pedido: pedidos[index] });
});

app.post('/api/pedidos/:id/estado', (req, res) => {
    const id = parseInt(req.params.id);
    const { estado } = req.body;
    const pedidos = leerPedidos();
    const index = pedidos.findIndex(p => p.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    }

    pedidos[index].estado = estado;
    guardarPedidos(pedidos);
    res.json({ success: true, pedido: pedidos[index] });
});

app.delete('/api/pedidos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    let pedidos = leerPedidos();
    const filtrados = pedidos.filter(p => p.id !== id);

    if (filtrados.length === pedidos.length) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    }

    guardarPedidos(filtrados);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Servidor seguro corriendo en el puerto ${PORT}`);
});