# 90 Faturas - Premium Edition

Este é o repositório preparado para o sistema **90 Faturas - Premium Edition**, desenvolvido em React (Vite) + Tailwind CSS.

## 🚀 Levar para o GitHub

1. Inicialize o repositório local:
   ```bash
   git init
   git add .
   git commit -m "Commit Inicial - 90 Faturas"
   ```
2. Crie um repositório no GitHub e adicione o remote:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```

## 💻 Cli Shell (Terminal)

Como este projeto utiliza Node.js e Vite, você pode gerí-lo via linha de comando ou utilizar scripts customizados caso queira convertê-lo futuramente.
Para rodar localmente no terminal:
```bash
npm install
npm run dev
```
Para construir (build):
```bash
npm run build
```

## 🔥 Deploy no Firebase (Hosting)

Os arquivos `firebase.json` e `.firebaserc` já foram pré-configurados na raiz do projeto.

1. Instale as ferramentas do Firebase via CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Faça login na sua conta do Google:
   ```bash
   firebase login
   ```
3. Inicialize ou apenas altere o ID do projeto no `.firebaserc`:
   Altere `seu-projeto-firebase-aqui` pelo Project ID do seu Firebase.
4. Faça o build do seu app:
   ```bash
   npm run build
   ```
5. Publique no Firebase:
   ```bash
   firebase deploy --only hosting
   ```

## 📱 Utilizar no Kodular (Transformar em App Android)

O projeto é responsivo (Mobile-First) e, desta forma, pode facilmente ser encapsulado num aplicativo via Kodular usando o componente **Web Viewer** (Visualizador Web).

### Instruções para o Kodular:
1. **Opção A (Hospedado):** 
   Faça primeiro o deploy no Firebase (ou Vercel, Netlify, etc.), copie a URL pública que foi gerada (Ex: `https://seu-app.web.app`) e adicione essa URL no parâmetro *HomeUrl* do seu componente **Web Viewer** no Kodular.
2. **Opção B (Offline/Local HTML no Kodular):**
   - Construa o projeto localmente com `npm run build`.
   - Pode hospedar os arquivos `dist` diretamente como Assets no Kodular, mas devido e possíveis restrições de rotas (`index.html`), o método da Opção A (Hospedado via Firebase) é muito mais fiável e recebe atualizações instantâneas sem você precisar de gerar a APK sempre de novo.

> **Dicas Adicionais para Kodular:** 
> - Não se esqueça de solicitar permissões de armazenamento (Storage) caso usem impressão e exportação de PDF/PNG para salvarem localmente as faturas geradas pela WebView, utilizando os bloquinhos do Kodular para manipulação de downloads da Web View.

## Suporte

Projeto desenhado pelo Grupo 90 Creations.
WhatsApp: +244 943 355 704
Email: dias90kk@gmail.com
