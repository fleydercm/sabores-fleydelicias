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

// Rutas explícitas para las vistas HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Ruta que recibe el pedido del cliente
app.post('/api/pedido', upload.single('comprobante'), (req, res) => {
    try {
        const { nombre, telefono, direccion, cantidad, pagoEstado } = req.body;
        const file = req.file;

        const nuevoPedido = {
            id: Date.now(),
            fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
            nombre,
            telefono,
            direccion,
            cantidad: parseInt(cantidad) || 1,
            comprobante: file ? file.filename : 'No adjuntado',
            estado: 'Pendiente',
            pagoEstado: pagoEstado || (file ? 'Pagado' : 'Debe')
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

// Ruta para actualizar el estado de un pedido
app.post('/api/pedidos/:id/estado', (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        let pedidos = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];
        
        const pedido = pedidos.find(p => p.id == id);
        if (pedido) {
            pedido.estado = estado;
            fs.writeFileSync('pedidos.json', JSON.stringify(pedidos, null, 2));
            return res.json({ success: true });
        }
        res.status(404).json({ error: 'Pedido no encontrado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});

// Ruta para actualizar el estado de pago (Pagado / Debe)
app.post('/api/pedidos/:id/pago', (req, res) => {
    try {
        const { id } = req.params;
        const { pagoEstado } = req.body;
        
        let pedidos = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];
        
        const pedido = pedidos.find(p => p.id == id);
        if (pedido) {
            pedido.pagoEstado = pagoEstado;
            fs.writeFileSync('pedidos.json', JSON.stringify(pedidos, null, 2));
            return res.json({ success: true });
        }
        res.status(404).json({ error: 'Pedido no encontrado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el pago' });
    }
});

// Ruta para editar un pedido existente (Corregido y activo)
app.put('/api/pedidos/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, telefono, direccion, cantidad, pagoEstado } = req.body;
        
        let pedidos = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];
        
        const pedido = pedidos.find(p => p.id == id);
        if (pedido) {
            if (nombre) pedido.nombre = nombre;
            if (telefono) pedido.telefono = telefono;
            if (direccion) pedido.direccion = direccion;
            if (cantidad) pedido.cantidad = parseInt(cantidad) || pedido.cantidad;
            if (pagoEstado) pedido.pagoEstado = pagoEstado;
            
            fs.writeFileSync('pedidos.json', JSON.stringify(pedidos, null, 2));
            return res.json({ success: true });
        }
        res.status(404).json({ error: 'Pedido no encontrado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el pedido' });
    }
});

// Ruta para eliminar un pedido
app.delete('/api/pedidos/:id', (req, res) => {
    try {
        const { id } = req.params;
        let pedidos = fs.existsSync('pedidos.json') 
            ? JSON.parse(fs.readFileSync('pedidos.json', 'utf8')) 
            : [];
        
        const pedidosFiltrados = pedidos.filter(p => p.id != id);
        fs.writeFileSync('pedidos.json', JSON.stringify(pedidosFiltrados, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar pedido' });
    }
});

// Configuración de credenciales de Administrador (admin.json)
const ADMIN_FILE = path.join(__dirname, 'admin.json');

app.get('/api/verificar-admin', (req, res) => {
    const creado = fs.existsSync(ADMIN_FILE);
    res.json({ creado });
});

app.post('/api/crear-admin', (req, res) => {
    try {
        const { usuario, password } = req.body;
        fs.writeFileSync(ADMIN_FILE, JSON.stringify({ usuario, password }, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error al crear el usuario' });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { usuario, password } = req.body;
        if (!fs.existsSync(ADMIN_FILE)) {
            return res.json({ success: false, mensaje: 'No hay usuario registrado' });
        }
        const adminData = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
        if (adminData.usuario === usuario && adminData.password === password) {
            res.json({ success: true });
        } else {
            res.json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
        }
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error en el servidor' });
    }
});

app.post('/api/actualizar-admin', (req, res) => {
    try {
        const { usuario, password } = req.body;
        fs.writeFileSync(ADMIN_FILE, JSON.stringify({ usuario, password }, null, 2));
        res.json({ success: true, mensaje: '¡Datos actualizados con éxito!' });
    } catch (error) {
        res.status(500).json({ success: false, mensaje: 'Error al actualizar' });
    }
});

// Inicio del servidor al final de todo
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
});