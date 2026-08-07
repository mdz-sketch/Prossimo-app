import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login({ onLoginSuccess }) {
  const [modalitaRecupero, setModalitaRecupero] = useState(false);
  const [emailInviata, setEmailInviata] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrore('');
    setCaricamento(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setCaricamento(false);

    if (error) {
      setErrore('Email o password non corrette');
      return;
    }

    onLoginSuccess(data.user);
  };

  const handleRecupero = async (e) => {
    e.preventDefault();
    setErrore('');
    setCaricamento(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    setCaricamento(false);

    if (error) {
      setErrore("Errore nell'invio dell'email: " + error.message);
      return;
    }

    setEmailInviata(true);
  };

  if (modalitaRecupero) {
    return (
      <div style={{ maxWidth: 400, margin: '50px auto', padding: 20 }}>
        <h2>Recupera password</h2>
        {emailInviata ? (
          <>
            <p>Controlla la tua casella email: ti abbiamo inviato un link per reimpostare la password.</p>
            <button
              type="button"
              onClick={() => { setModalitaRecupero(false); setEmailInviata(false); setErrore(''); }}
              style={{ width: '100%', padding: 10 }}
            >
              Torna al login
            </button>
          </>
        ) : (
          <form onSubmit={handleRecupero}>
            <div style={{ marginBottom: 12 }}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: 8 }}
              />
            </div>
            {errore && <p style={{ color: 'red' }}>{errore}</p>}
            <button type="submit" disabled={caricamento} style={{ width: '100%', padding: 10 }}>
              {caricamento ? 'Invio in corso...' : 'Invia email di recupero'}
            </button>
            <button
              type="button"
              onClick={() => { setModalitaRecupero(false); setErrore(''); }}
              style={{ width: '100%', padding: 10, marginTop: 8 }}
            >
              Torna al login
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '50px auto', padding: 20 }}>
      <h2>Accesso Operatore</h2>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        {errore && <p style={{ color: 'red' }}>{errore}</p>}
        <button type="submit" disabled={caricamento} style={{ width: '100%', padding: 10 }}>
          {caricamento ? 'Accesso in corso...' : 'Accedi'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => { setModalitaRecupero(true); setErrore(''); }}
        style={{ width: '100%', padding: 10, marginTop: 8, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
      >
        Password dimenticata?
      </button>
    </div>
  );
}
