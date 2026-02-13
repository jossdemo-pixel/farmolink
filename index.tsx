
import React from 'react';
import ReactDOM from 'react-dom/client';

/**
 * O FarmoLink agora utiliza uma arquitetura Backend-for-Frontend (BFF).
 * As chaves de API são gerenciadas exclusivamente no servidor Node.js
 * para garantir segurança e compatibilidade com builds Android/Capacitor.
 */

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);

  const supabaseUrl =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);
  const supabaseAnonKey =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined);

  if (!supabaseUrl || !supabaseAnonKey) {
    root.render(
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: '720px', width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>Configuração ausente</h1>
          <p style={{ marginTop: '10px', color: '#374151' }}>
            Defina <code>VITE_SUPABASE_URL</code>/<code>VITE_SUPABASE_ANON_KEY</code> ou <code>NEXT_PUBLIC_SUPABASE_URL</code>/<code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
          <p style={{ marginTop: '10px', color: '#6b7280', fontSize: '14px' }}>
            Local: crie <code>.env.local</code> com base em <code>.env.example</code>.
          </p>
          <p style={{ marginTop: '6px', color: '#6b7280', fontSize: '14px' }}>
            Vercel: configure as mesmas variáveis em Project Settings - Environment Variables e faça novo deploy.
          </p>
        </div>
      </div>
    );
  } else {
    import('./App')
      .then(({ App }) => {
        root.render(<App />);
      })
      .catch((error) => {
        console.error('Falha ao inicializar App:', error);
        root.render(
          <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '720px', width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
              <h1 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>Erro ao carregar a aplicação</h1>
              <p style={{ marginTop: '10px', color: '#374151' }}>
                Abra o console do navegador para detalhes técnicos.
              </p>
            </div>
          </div>
        );
      });
  }
}
