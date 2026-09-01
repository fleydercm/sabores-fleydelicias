const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta principal (Formulario de clientes)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta del Panel de Administración
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Recibir pedido con estado inicial "Pendiente"
app.post('/api/pedido', upload.single('comprobante'), (req, res) => {
    try {
        const { nombre, telefono, direccion, cantidad } = req.body;
        const file = req.file;

        const nuevoPedido = {
            id: Date.now(),
            fecha: new Date().toLocaleString(),
            nombre,
            telefono,
            direccion,
            cantidad: parseInt(cantidad) || 1,
            comprobante: file ? file.filename : null,
            estado: 'Pendiente' // Estado inicial por defecto
        };

        let pedidosActuales = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];

        pedidosActuales.push(nuevoPedido);
        fs.writeFileSync('pedidos.json', JSON.stringify(pedidosActuales, null, 2));

        return res.json({ success: true, message: '¡Pedido registrado correctamente!' });
    } catch (error) {
        console.error('Error al guardar el pedido:', error);
        return res.status(500).json({ error: 'Error interno al procesar el pedido.' });
    }
});

// Obtener lista de pedidos para el panel
app.get('/api/pedidos', (req, res) => {
    try {
        const pedidos = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];
        res.json(pedidos);
    } catch (error) {
        res.status(500).json({ error: 'Error al leer los pedidos.' });
    }
});

// Actualizar el estado de un pedido (En camino, Entregado, etc.)
app.post('/api/pedidos/:id/estado', (req, res) => {
    try {
        const pedidoId = Number(req.params.id);
        const { estado } = req.body;

        let pedidos = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];

        const index = pedidos.findIndex(p => p.id === pedidoId);
        if (index !== -1) {
            pedidos[index].estado = estado;
            fs.writeFileSync('pedidos.json', JSON.stringify(pedidos, null, 2));
            return res.json({ success: true });
        }
        return res.status(404).json({ error: 'Pedido no encontrado' });
    } catch (error) {
        return res.status(500).json({ error: 'Error al actualizar el estado' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
});