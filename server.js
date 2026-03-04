const express = require('express');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cifraHandler = require('./api/cifra');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuración de Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CifraClub API Español',
      version: '1.2.0',
      description: 'API para obtener acordes y letras de CifraClub. Versión mejorada en Node.js.',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
      },
    ],
  },
  apis: ['./api/*.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Ruta principal traducida
app.get('/api/cifra', cifraHandler);

// Redirección simple para conveniencia
app.get('/', (req, res) => {
  res.json({
    mensaje: 'Bienvenido a la API de CifraClub',
    documentacion: '/docs',
    estado: 'OK'
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Documentación: http://localhost:${PORT}/docs`);
});