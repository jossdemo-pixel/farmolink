
/**
 * Serviço de integração direta com Cloudinary
 */

const CLOUD_NAME = 'dzvusz0u4';
const UPLOAD_PRESET = 'farmolink_presets';

export const uploadImageToCloudinary = async (file: File): Promise<string | null> => {
    if (!navigator.onLine) return null;
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Falha no upload para Cloudinary');

        const data = await response.json();
        return data.secure_url; 
    } catch (error) {
        console.error('Erro Cloudinary:', error);
        return null;
    }
};
