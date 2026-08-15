import { useState } from 'react';
import { LogIn, UserPlus, KeyRound, ArrowLeft } from 'lucide-react';
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
      <div className="board-panel">
        <div className="board-label"><KeyRound size={13} style={{ display: 'inline', marginRight: 6, position: 'relative', top: -1 }} />Recupera password</div>
        {messaggio ? (
          <>
            <p style={{ fontSize: 13, color: '#9FB3AC', marginTop: 10 }}>{messaggio}</p>
            <button type="button" className="cta ghost" onClick={() => cambiaModalita('login')}>
              <ArrowLeft size={15} /> Torna al login
            </button>
          </>
        ) : (
          <form onSubmit={handleRecupero}>
            <label className="field-label" style={{ marginTop: 0 }}>Email</label>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {errore && <div className="error-box">{errore}</div>}
            <button type="submit" className="cta primary" disabled={caricamento}>
              {caricamento ? 'Invio in corso...' : 'Invia email di recupero'}
            </button>
            <button type="button" className="cta ghost" onClick={() => cambiaModalita('login')}>
              <ArrowLeft size={15} /> Torna al login
            </button>
          </form>
        )}
      </div>
    );
  }

  if (modalita === 'registrazione') {
    return (
      <div className="board-panel">
        <div className="board-label"><UserPlus size={13} style={{ display: 'inline', marginRight: 6, position: 'relative', top: -1 }} />Registrati come operatore</div>
        {messaggio ? (
          <>
            <p style={{ fontSize: 13, color: '#9FB3AC', marginTop: 10 }}>{messaggio}</p>
            <button type="button" className="cta ghost" onClick={() => cambiaModalita('login')}>
              <ArrowLeft size={15} /> Torna al login
            </button>
          </>
        ) : (
          <form onSubmit={handleRegistrazione}>
            <label className="field-label" style={{ marginTop: 0 }}>Email</label>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="field-label">Password</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
            <label className="field-label">Conferma password</label>
            <PasswordInput value={confermaPassword} onChange={(e) => setConfermaPassword(e.target.value)} required />
            {errore && <div className="error-box">{errore}</div>}
            <button type="submit" className="cta primary" disabled={caricamento}>
              {caricamento ? 'Registrazione in corso...' : 'Registrati'}
            </button>
            <button type="button" className="cta ghost" onClick={() => cambiaModalita('login')}>
              <ArrowLeft size={15} /> Torna al login
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="board-panel">
      <div className="board-label"><LogIn size={13} style={{ display: 'inline', marginRight: 6, position: 'relative', top: -1 }} />Accesso operatore</div>
      <form onSubmit={handleLogin}>
        <label className="field-label" style={{ marginTop: 0 }}>Email</label>
        <input
          type="email"
          className="field-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="field-label">Password</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
        {errore && <div className="error-box">{errore}</div>}
        <button type="submit" className="cta primary" disabled={caricamento}>
          {caricamento ? 'Accesso in corso...' : 'Accedi'}
        </button>
      </form>
      <button type="button" className="cta ghost" onClick={() => cambiaModalita('registrazione')}>
        <UserPlus size={15} /> Registrati
      </button>
      <button
        type="button"
        onClick={() => cambiaModalita('recupero')}
        style={{
          background: 'none',
          border: 'none',
          color: '#9FB3AC',
          fontSize: 12.5,
          marginTop: 14,
          padding: 0,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          display: 'block',
          width: '100%',
          textAlign: 'center',
        }}
      >
        Password dimenticata?
      </button>
    </div>
  );
}
