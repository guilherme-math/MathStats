import express from 'express';
import cors from 'cors';
import path from 'path';
import router from './routes/routes';
import dotenv from 'dotenv';
 
dotenv.config();
 
const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));
 
//rota api
app.use('/api', router);
 
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}!`);
    console.log(`Abra http://localhost:${PORT} no navegador para testar.`);
});