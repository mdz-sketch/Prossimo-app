import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import PasswordInput from './PasswordInput';

export default function Login({ onLoginSuccess }) {
  const [modalita, setModalita] = useState('login'); // 'login' | 'recupero' | 'registrazione'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confermaPassword, setConfermaPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);
  const [messaggio, setMessaggio] = useState('');

  const cambiaModalita = (nuova) => {
    setModalita(nuova);
    setErrore('');
    setMessaggio('');
  };

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

    setMessaggio('Controlla la tua casella email: ti abbiamo inviato un link per reimpostare la password.');
  };

  const handleRegistrazione = async (e) => {
    e.preventDefault();
    setErrore('');

    if (password.length < 6) {
      setErrore('La password deve avere almeno 6 caratteri');
      return;
    }
    if (password !== confermaPassword) {
      setErrore('Le due password non coincidono');
      return;
    }

    setCaricamento(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setCaricamento(false);

    if (error) {
      setErrore('Errore nella registrazione: ' + error.message);
      return;
    }

    if (data.session) {
      // Conferma email disattivata sul progetto: sessione gia' attiva
      onLoginSuccess(data.user);
      return;
    }

    setMessaggio("Registrazione completata! Controlla la tua email per confermare l'account, poi torna qui e accedi.");
  };

  if (modalita === 'recupero') {
    return (
      <div style={{ maxWidth: 400, margin: '50px auto', padding: 20 }}>
        <h2>Recupera password</h2>
        {messaggio ? (
          <>
            <p>{messaggio}</p>
            <button type="button" onClick={() => cambiaModalita('login')} style={{ width: '100%', padding: 10 }}>
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
            <button type="button" onClick={() => cambiaModalita('login')} style={{ width: '100%', padding: 10, marginTop: 8 }}>
              Torna al login
            </button>
          </form>
        )}
      </div>
    );
  }

  if (modalita === 'registrazione') {
    return (
      <div style={{ maxWidth: 400, margin: '50px auto', padding: 20 }}>
        <h2>Registrati come operatore</h2>
        {messaggio ? (
          <>
            <p>{messaggio}</p>
            <button type="button" onClick={() => cambiaModalita('login')} style={{ width: '100%', padding: 10 }}>
              Torna al login
            </button>
          </>
        ) : (
          <form onSubmit={handleRegistrazione}>
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
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Conferma password</label>
              <PasswordInput value={confermaPassword} onChange={(e) => setConfermaPassword(e.target.value)} required />
            </div>
            {errore && <p style={{ color: 'red' }}>{errore}</p>}
            <button type="submit" disabled={caricamento} style={{ width: '100%', padding: 10 }}>
              {caricamento ? 'Registrazione in corso...' : 'Registrati'}
            </button>
            <button type="button" onClick={() => cambiaModalita('login')} style={{ width: '100%', padding: 10, marginTop: 8 }}>
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
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {errore && <p style={{ color: 'red' }}>{errore}</p>}
        <button type="submit" disabled={caricamento} style={{ width: '100%', padding: 10 }}>
          {caricamento ? 'Accesso in corso...' : 'Accedi'}
        </button>
      </form>
      <button type="button" onClick={() => cambiaModalita('registrazione')} style={{ width: '100%', padding: 10, marginTop: 8 }}>
        Registrati
      </button>
      <button
        type="button"
        onClick={() => cambiaModalita('recupero')}
        style={{ width: '100%', padding: 10, marginTop: 8, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
      >
        Password dimenticata?
      </button>
    </div>
  );
}
