import express from 'express';

const router = express.Router();


router.use('/resources', require('./resource.routes').default);

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Content service is up and running',
  });
});



export default router;
