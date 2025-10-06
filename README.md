# 🚀 Demo de Orquestación BPEL - Plataforma Educativa Interactiva

Una aplicación web interactiva completa que demuestra conceptos de orquestación de procesos de negocio usando BPEL (Business Process Execution Language), con actividades gamificadas de aprendizaje y sistema de calificación en tiempo real.

## ✨ Características Principales

### 🎮 **Simulación BPEL en Tiempo Real**
- ✅ **Interfaz completamente en español**
- ✅ **Simulación de orquestación BPEL paso a paso**
- ✅ **Control de velocidad avanzado (0.1x - 10x)**
- ✅ **Tres escenarios de prueba realistas:**
  - 🎯 Flujo exitoso (Happy Path)
  - ❌ Pago rechazado
  - 📦 Sin inventario (con compensación)
- ✅ **Código BPEL educativo con sintaxis coloreada**
- ✅ **Timeline de eventos en tiempo real**
- ✅ **Variables dinámicas JSON**
- ✅ **Modo oscuro/claro adaptatible**
- ✅ **Funciones de copiar/descargar código BPEL**

### 🎓 **Actividades Interactivas Gamificadas**
- 🧩 **Sopas de Letras BPEL**: 24x24 celdas con terminología técnica
- 🎯 **Drag-and-Drop**: Completar código BPEL real arrastrando elementos
- 👥 **7 Equipos Temáticos**: Cada uno con desafíos únicos
- � **Sistema de Calificación**: Puntuación de 0.0 a 5.0 en tiempo real
- 🏆 **Progreso Visual**: Barras de progreso y efectos de celebración
- 📚 **Contenido Educativo**: Ejercicios basados en casos reales

### 📈 **Sistema de Evaluación Avanzado**
- **Calificación Automática**: 50% sopa de letras + 50% código completado
- **Colores Dinámicos**: Verde (excelente) → Azul (bueno) → Amarillo (regular) → Rojo (necesita mejorar)
- **Efectos Especiales**: Animaciones de celebración al alcanzar 5.0
- **Seguimiento Individual**: Cada equipo mantiene su progreso independiente

## 🐳 Despliegue con Docker

### Comandos Básicos

```bash
# Construir imagen con configuración optimizada
docker build -t bpel-demo .

# Ejecutar contenedor con configuración de producción
docker run -d --name bpel-demo -p 8080:80 bpel-demo

# Ver logs del contenedor
docker logs bpel-demo

# Detener y limpiar
docker stop bpel-demo
docker rm bpel-demo
```

### Docker Compose (Recomendado)

```yaml
version: '3.8'
services:
  bpel-demo:
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.bpel.rule=Host(`bpel.localhost`)"
```

### Acceso a la Aplicación

Una vez desplegada, la aplicación estará disponible en:
- **Demo Principal**: http://localhost:8080
- **Actividades Interactivas**: http://localhost:8080/actividades.html

## 🏗️ Arquitectura Docker Mejorada

### Características del Contenedor
- **Base**: `nginx:alpine` (ligero y seguro)
- **Puerto**: 80 (interno), mapeado a 8080 (externo) 
- **SPA Support**: Configuración para Single Page Application
- **Headers de Seguridad**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **Cache Optimizado**: Archivos estáticos con cache de 1 año
- **Ruteo Inteligente**: Soporte para `/actividades` route

## 📁 Estructura del Proyecto

```
demo-bpel/
├── 📄 index.html          # Página principal con demo BPEL
├── 🎮 actividades.html    # Actividades interactivas gamificadas
├── ⚡ main.js             # Lógica completa (demo + actividades)
├── 🐳 Dockerfile          # Configuración de contenedor optimizada
└── 📖 README.md           # Esta documentación
```

## 🎯 Funcionalidades por Página

### 🏠 **index.html** - Demo Principal
- Simulación visual de orquestación BPEL
- Control temporal interactivo
- Visualización de código y variables
- Cambios de tema (claro/oscuro)
- Descarga de código BPEL generado

### 🎮 **actividades.html** - Actividades Gamificadas
- **7 Equipos Temáticos**: Procesos, Servicios, Integración, Datos, Seguridad, Performance, Governance
- **Sopas de Letras**: Grillas 24x24 con terminología BPEL
- **Completar Código**: Ejercicios drag-and-drop con snippets reales
- **Sistema de Calificación**: Evaluación automática 0.0 - 5.0
- **Progreso Visual**: Barras dinámicas y efectos de celebración

## 🎮 Guía de Uso - Actividades Interactivas

### Para Estudiantes:

1. **Seleccionar Equipo**: Usar el selector dropdown
2. **Sopa de Letras**: 
   - Arrastar para seleccionar palabras
   - Encuentra todos los términos BPEL
   - Las palabras encontradas se resaltan en verde
3. **Completar Código**:
   - Arrastra elementos del panel izquierdo
   - Suéltalos en las zonas de destino
   - El código se completa automáticamente
4. **Calificación**:
   - Se actualiza en tiempo real
   - 50% sopa de letras + 50% código
   - Objetivo: alcanzar 5.0 puntos

### Para Instructores:

- **Múltiples Equipos**: 7 actividades únicas sin repetición
- **Evaluación Automática**: Sistema de puntuación objetivo
- **Progreso Visual**: Monitoreo fácil del avance estudiantil
- **Contenido Educativo**: Basado en estándares BPEL reales

## 🛠️ Desarrollo Local

### Sin Docker

```bash
# Navegar al directorio
cd demo-bpel

# Servidor Python simple
python -m http.server 8000

# Acceder en: http://localhost:8000
```

### Con Docker (Recomendado)

```bash
# Desarrollo con recarga automática
docker run -d --name bpel-dev \
  -p 8080:80 \
  -v $(pwd):/usr/share/nginx/html \
  nginx:alpine

# Editar archivos y ver cambios instantáneos
```

## 📚 Tecnologías Utilizadas

- **Frontend**: HTML5, CSS3 (Tailwind CSS), JavaScript ES6+
- **Drag & Drop**: HTML5 Drag and Drop API nativa
- **Containerización**: Docker + Nginx Alpine
- **Estilos**: Sistema de diseño consistente con modo oscuro
- **Animaciones**: CSS transitions y transforms
- **Terminología**: Estándares BPEL oficiales

## 🎓 Valor Educativo

### Conceptos BPEL Cubiertos:
- **Orquestación vs Coreografía**
- **Actividades básicas**: `<invoke>`, `<receive>`, `<reply>`
- **Actividades estructuradas**: `<sequence>`, `<flow>`, `<if>`
- **Manejo de fallos**: `<catch>`, `<compensate>`
- **Variables y partners**
- **Correlaciones y enlaces**

### Metodología de Aprendizaje:
- **Learning by Doing**: Ejercicios prácticos interactivos
- **Gamificación**: Sistema de puntos y progreso visual
- **Retroalimentación Inmediata**: Calificación en tiempo real
- **Diversidad de Contenido**: 7 temáticas diferentes
- **Progresión Gradual**: De conceptos básicos a avanzados

## 🔧 Configuración Avanzada

### Variables de Entorno

```bash
# Puerto personalizado
docker run -e PORT=3000 -p 3000:3000 bpel-demo

# Modo debug
docker run -e DEBUG=true bpel-demo
```

### Nginx Personalizado

```nginx
# Añadir al nginx.conf para funcionalidades extra
location /api/ {
    proxy_pass http://backend:8080/;
}
```

## 🐛 Resolución de Problemas

### Problemas Comunes:

1. **Puerto ocupado**: Cambiar el puerto host: `-p 8081:80`
2. **Archivo no encontrado**: Verificar que todos los archivos estén en el directorio
3. **Drag & Drop no funciona**: Actualizar navegador (requiere HTML5 moderno)
4. **Actividades no cargan**: Verificar ruta `/actividades.html`

### Logs útiles:

```bash
# Ver logs del contenedor
docker logs bpel-demo -f

# Verificar archivos en contenedor
docker exec bpel-demo ls -la /usr/share/nginx/html/
```

## 📈 Métricas y Analíticas

El sistema rastrea automáticamente:
- ✅ **Palabras encontradas** por equipo
- ✅ **Elementos de código completados**
- ✅ **Tiempo de resolución** (implícito)
- ✅ **Calificación final** (0.0 - 5.0)
- ✅ **Progreso visual** con barras dinámicas

## 🚀 Próximas Mejoras

- [ ] Persistencia de puntuaciones con localStorage
- [ ] Modo multijugador con WebSockets
- [ ] Más tipos de actividades (memoria, quiz)
- [ ] Dashboard de instructor con estadísticas
- [ ] Exportar resultados a PDF/Excel
- [ ] Integración con LMS (Moodle, Canvas)

---

**Desarrollado para la educación en Orquestación de Procesos de Negocio y BPEL** 🎓

## 🛠️ Desarrollo

### Estructura de Archivos
```
bpel/
├── index.html              # Aplicación principal
├── main.js                 # Lógica de orquestación
├── Dockerfile              # Configuración Docker simple
└── README.md               # Documentación
```

## 🤝 Contribución

1. Fork el repositorio
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Este proyecto es para fines educativos en el curso de Administración de Sistemas.

---

**Autor**: Demo BPEL Team  
**Curso**: Administración de Sistemas 2025-2  
**Tecnologías**: HTML5, JavaScript ES6, Tailwind CSS, Docker, Nginx