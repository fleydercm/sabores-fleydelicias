const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuración de multer para guardar los comprobantes
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

// Archivos estáticos públicos y uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta principal que busca el index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta que recibe el pedido del cliente
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
            comprobante: file ? file.filename : 'No adjuntado'
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

// Ruta para que el panel de administración lea la lista de pedidos
app.get('/api/pedidos', (req, res) => {
    try {
        const pedidos = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];
        res.json(pedidos);
    } catch (error) {
        res.status(500).json({ error: 'Error al leer los pedidos' });
    }
});

// Ruta de autenticación para el administrador
app.post('/api/login', (req, res) => {
    const { usuario, clave } = req.body;

    if (usuario === 'admin' && clave === '1234') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }
});

// Ruta para verificar el estado de administración que pide admin.html
app.get('/api/verificar-admin', (req, res) => {
    res.json({ success: true });
});

// Ruta alternativa si admin.html usa actualizar-admin para los pedidos
app.post('/api/actualizar-admin', (req, res) => {
    res.json({ success: true });
});

// Inicio del servidor al final de todo
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
});