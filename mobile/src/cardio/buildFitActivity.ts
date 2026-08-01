// La implementación vive ahora en @pulsia/shared, porque la usan los DOS clientes: el móvil
// (confirmación manual con form) y la web (subida batch). Se re-exporta acá para no tocar los
// imports existentes del móvil. Ver shared/src/cardio/buildFitActivity.ts.
export { buildFitActivity, type FitFormFields } from "@pulsia/shared";
