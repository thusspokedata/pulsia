// Identidad visual: "clínico fresco" — claro, teal + slate. Toda la app referencia estos tokens,
// así que cambiar acá recolorea todas las pantallas.
export const colors = {
  accent: "#0E7C86", // teal profundo — acciones (botones, CTA, tab activo)
  accentSoft: "#E5F4F4", // fondo de chips/badges de acento
  accentText: "#0A5A62", // texto/íconos sobre accentSoft
  bg: "#F4F7FA", // fondo de página (gris frío)
  surface: "#FFFFFF", // tarjetas y tiles
  border: "#E2E8EF", // hairline frío
  text: "#16202A", // slate casi negro
  textMuted: "#64748B", // slate atenuado
  danger: "#C0392B", // rojo semántico (errores)

  // Nuevos (los usa la Fase 2 de pulido de componentes):
  success: "#2FA98C", // verde salud — buenas tendencias (peso ↓, ECG normal)
  successSoft: "#E3F5EF", // fondo de badges/íconos de salud
  successText: "#1E8A6E", // texto/íconos sobre successSoft
  surfaceMuted: "#E8EEF3", // superficies hundidas (track de segmented, inputs)
  icon: "#94A3B0", // íconos inactivos (barra de navegación)
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 20 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
