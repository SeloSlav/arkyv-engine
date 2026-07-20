import { getImageProviderStatus, imageProviderErrorResponse } from '@/lib/imageProvider';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const status = await getImageProviderStatus();
        return res.status(200).json(status);

    } catch (error) {
        console.error('Error checking image provider:', error);
        const response = imageProviderErrorResponse(error, 'Unable to check the image provider.');
        return res.status(response.status).json(response.body);
    }
}

