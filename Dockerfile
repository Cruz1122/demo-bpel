# Demo BPEL - Aplicación Interactiva de Aprendizaje
FROM nginx:alpine

# Metadatos del contenedor
LABEL maintainer="Demo BPEL Team"
LABEL description="Aplicación web interactiva para aprender BPEL con simulaciones en tiempo real"
LABEL version="2.0"

# Copiar archivos principales de la aplicación
COPY index.html /usr/share/nginx/html/
COPY actividades.html /usr/share/nginx/html/
COPY main.js /usr/share/nginx/html/
COPY README.md /usr/share/nginx/html/

# Configuración personalizada de Nginx para SPA
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Configuración para aplicación de una sola página
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Configuración para actividades interactivas
    location /actividades {
        try_files \$uri /actividades.html;
    }

    # Headers de seguridad y cache
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Cache para archivos estáticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Exponer puerto 80
EXPOSE 80

# Ejecutar Nginx
CMD ["nginx", "-g", "daemon off;"]