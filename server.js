const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const ADMIN_USER = process.env.ADMIN_USER || 'fleydelicias26';
const ADMIN_PASS = process.env.ADMIN_PASS || '123456';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Login ultra simple sin tokens, cookies complejas ni restricciones de empresa
app.post('/api/login', (req, res) => {
    const username = req.body.username || req.body.usuario;
    const password = req.body.password;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ success: true, message: 'Acceso concedido' });
    }
    
    return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/pedidos', (req, res) => {
    res.json(leerPedidos());
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

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
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

app.put('/api/pedidos/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pedidos = leerPedidos();
        const idx = pedidos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({ success: false, message: 'No encontrado' });

        pedidos[idx] = { ...pedidos[idx], ...req.body };
        guardarPedidos(pedidos);
        res.json({ success: true, pedido: pedidos[idx] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

app.delete('/api/pedidos/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let pedidos = leerPedidos();
        const filtrados = pedidos.filter(p => p.id !== id);
        if (filtrados.length === pedidos.length) return res.status(404).json({ success: false, message: 'No encontrado' });

        guardarPedidos(filtrados);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ligero activo en puerto ${PORT}`);
});