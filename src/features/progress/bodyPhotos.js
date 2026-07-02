import { BODY_PHOTO_LABELS } from '../../constants.js';

// Фото в записи может быть строкой (legacy) или объектом { src, label }.
export const getBodyPhotoSrc = (photo) => typeof photo === 'string' ? photo : photo?.src;
export const getBodyPhotoLabel = (photo, idx) => typeof photo === 'string' ? (BODY_PHOTO_LABELS[idx] || `Фото ${idx + 1}`) : (photo?.label || BODY_PHOTO_LABELS[idx] || `Фото ${idx + 1}`);
export const countBodyPhotos = (photos) => (photos || []).filter(photo => getBodyPhotoSrc(photo)).length;
