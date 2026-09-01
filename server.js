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

// Aquí le indicamos que los archivos públicos están en la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta principal que busca el index.html dentro de la carpeta 'public'
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta que recibe el pedido
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
});

app.post('/api/login', (req, res) => {
    const { usuario, clave } = req.body;

    // Ajusta 'admin' y tu contraseña por los datos que prefieras usar
    if (usuario === 'admin' && clave === '1234') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }
});