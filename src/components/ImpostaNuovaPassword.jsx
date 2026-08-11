import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import PasswordInput from './PasswordInput';

export default function ImpostaNuovaPassword({ onCompletato }) {
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrore('');

    if (password.length < 6) {
      setErrore('La password deve avere almeno 6 caratteri');
      return;
    }
    if (password !== conferma) {
      setErrore('Le due password non coincidono');
      return;
    }

    setCaricamento(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    setCaricamento(false);

    if (error) {
      setErrore('Errore: ' + error.message);
      return;
    }

    onCompletato(data.user);
  };

  return (
    <div style={{ maxWidth: 400, margin: '50px auto', padding: 20 }}>
      <h2>Imposta nuova password</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Nuova password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Conferma nuova password</label>
          <PasswordInput value={conferma} onChange={(e) => setConferma(e.target.value)} required />
        </div>
        {errore && <p style={{ color: 'red' }}>{errore}</p>}
        <button type="submit" disabled={caricamento} style={{ width: '100%', padding: 10 }}>
          {caricamento ? 'Salvataggio...' : 'Salva nuova password'}
        </button>
      </form>
    </div>
  );
}
