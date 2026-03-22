const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/caja', require('./routes/caja.routes'));
app.use('/api/database', require('./routes/database.routes'));

module.exports = app;