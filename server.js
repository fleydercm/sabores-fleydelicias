// Ruta para guardar el usuario y contraseña desde la plataforma
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// 1. Definir las rutas según estemos en tu PC o en la nube de Render
const esProduccion = process.env.NODE_ENV === 'production';

const directorioDatos = esProduccion ? '/data' : __dirname;
const archivoPedidos = path.join(directorioDatos, 'pedidos.json');
const directorioUploads = path.join(directorioDatos, 'uploads');
const archivoAdmin = path.join(directorioDatos, 'admin.json');

// 2. Configuración de Multer para guardar las fotos en el disco correcto
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(directorioUploads)) {
            fs.mkdirSync(directorioUploads, { recursive: true });
        }
        cb(null, directorioUploads);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// 3. Asegurar que express sirva las imágenes desde el disco correcto
app.use('/uploads', express.static(directorioUploads));

// Ruta para crear o guardar el usuario y contraseña desde la plataforma
app.post('/api/guardar-admin', express.json(), (req, res) => {
    const { usuario, password } = req.body;
    
    if (!usuario || !password) {
        return res.status(400).json({ success: false, mensaje: 'Faltan datos' });
    }

    const nuevoAdmin = { usuario, password };
    fs.writeFileSync(archivoAdmin, JSON.stringify(nuevoAdmin, null, 2));
    
    res.json({ success: true, mensaje: '¡Credenciales creadas con éxito!' });
});

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
            fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
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

// Ruta para consultar el estado de un pedido por su ID
app.get('/api/pedido/:id', async (req, res) => {
    try {
        const pedidoId = req.params.id;
        // Busca el pedido en tu base de datos o archivo JSON por su ID
        const pedido = pedidos.find(p => p.id == pedidoId); // (Ajusta según cómo guardes tus datos)
        
        if (!pedido) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        
        res.json({ estado: pedido.estado });
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar el pedido' });
    }
});

// Ruta para verificar si ya existe un administrador creado
app.get('/api/verificar-admin', (req, res) => {
    try {
        if (!fs.existsSync(archivoAdmin)) {
            return res.json({ creado: false });
        }
        res.json({ creado: true });
    } catch (error) {
        res.json({ creado: false });
    }
});

// Ruta para crear el usuario por primera vez desde la plataforma
app.post('/api/crear-admin', express.json(), (req, res) => {
    try {
        const { usuario, password } = req.body;
        if (!usuario || !password) {
            return res.json({ success: false, mensaje: 'Faltan datos' });
        }
        fs.writeFileSync(archivoAdmin, JSON.stringify({ usuario, password }, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, mensaje: 'Error al guardar' });
    }
});

// Ruta para iniciar sesión desde la plataforma
app.post('/api/login', express.json(), (req, res) => {
    try {
        const { usuario, password } = req.body;
        
        if (!fs.existsSync(archivoAdmin)) {
            return res.json({ success: false, mensaje: 'No hay usuario creado' });
        }

        const adminGuardado = JSON.parse(fs.readFileSync(archivoAdmin, 'utf8'));

        if (usuario === adminGuardado.usuario && password === adminGuardado.password) {
            res.json({ success: true });
        } else {
            res.json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
        }
    } catch (error) {
        res.json({ success: false, mensaje: 'Error en el servidor' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
});

// Modificar un pedido existente de forma independiente
app.put('/api/pedidos/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nombre, telefono, direccion, cantidad } = req.body;
        
        if (!fs.existsSync('pedidos.json')) return res.status(404).json({ error: 'No hay pedidos' });
        
        let pedidos = JSON.parse(fs.readFileSync('pedidos.json', 'utf8'));
        const index = pedidos.findIndex(p => p.id === id);

        if (index === -1) return res.status(404).json({ error: 'Pedido no encontrado' });

        pedidos[index].nombre = nombre || pedidos[index].nombre;
        pedidos[index].telefono = telefono || pedidos[index].telefono;
        pedidos[index].direccion = direccion || pedidos[index].direccion;
        if (cantidad) pedidos[index].cantidad = parseInt(cantidad);

        fs.writeFileSync('pedidos.json', JSON.stringify(pedidos, null, 2));
        res.json({ success: true, message: 'Pedido modificado con éxito' });
    } catch (error) {
        res.status(500).json({ error: 'Error al modificar el pedido' });
    }
});

// Eliminar un pedido específico por su ID
app.delete('/api/pedidos/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!fs.existsSync('pedidos.json')) return res.status(404).json({ error: 'No hay pedidos' });
        
        let pedidos = JSON.parse(fs.readFileSync('pedidos.json', 'utf8'));
        const nuevosPedidos = pedidos.filter(p => p.id !== id);

        if (pedidos.length === nuevosPedidos.length) return res.status(404).json({ error: 'Pedido no encontrado' });

        fs.writeFileSync('pedidos.json', JSON.stringify(nuevosPedidos, null, 2));
        res.json({ success: true, message: 'Pedido eliminado con éxito' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el pedido' });
    }
});