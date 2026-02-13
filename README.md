# FarmoLink

## Rodar local (web)

Pré-requisitos: Node.js 20+.

1) Instale dependências:
```bash
npm install
```

2) Crie um arquivo `.env.local` baseado em `.env.example` e preencha as variáveis do Supabase:
```bash
copy .env.example .env.local
```

3) Rode:
```bash
npm run dev
```

## Deploy (Vercel)

- Configure as variáveis de ambiente do projeto na Vercel (mesmas do `.env.example`).
- Build: `npm run build`
- Output: `dist`
