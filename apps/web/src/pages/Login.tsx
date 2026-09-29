import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { api } from '../lib/api';

export function Login() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api<{ token: string; user: object }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('epx-token', result.token);
      localStorage.setItem('epx-user', JSON.stringify(result.user));
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar. Verifique se a API está ligada.');
    } finally {
      setLoading(false);
    }
  }

  const sessionExpired = new URLSearchParams(window.location.search).get('reason') === 'session-expired';
  return <main className="login-page">
    <section className="login-visual">
      <img src="/pizza-hero.png" alt="Pizza artesanal" />
      <div className="login-overlay">
        <Brand />
        <div><span className="kicker">Feito para pizzarias</span><h1>Mais pedidos.<br />Menos correria.</h1><p>WhatsApp, cozinha e entregas trabalhando juntos, em tempo real.</p></div>
        <blockquote>“WhatsApp, cardápio e operação em um só lugar.”<small>— EPX Food</small></blockquote>
      </div>
    </section>
    <section className="login-form-wrap">
      <form className="login-form" onSubmit={submit}>
        <div className="login-mobile-brand"><Brand /></div>
        <span className="eyebrow">PAINEL ADMINISTRATIVO</span>
        <h2>Que bom ter você de volta</h2>
        <p>Entre para acompanhar sua operação.</p>
        {sessionExpired && !error && <div className="form-error">Sua sessão expirou. Entre novamente para conectar o WhatsApp.</div>}
        <label>E-mail<div className="input-wrap"><Mail size={18} /><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="seu@email.com" required /></div></label>
        <label>Senha<div className="input-wrap"><LockKeyhole size={18} /><input value={password} onChange={(event) => setPassword(event.target.value)} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" required /><button type="button" onClick={() => setShow(!show)} aria-label="Mostrar senha">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <div className="form-row"><label className="check"><input type="checkbox" /> <span>Lembrar de mim</span></label><span>Redefinição pelo suporte</span></div>
        {error && <div className="form-error">{error}</div>}
        <button className="button primary login-submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar no painel'}</button>
        <div className="login-divider"><span>ou</span></div>
        <Link className="button login-signup" to="/cadastro"><UserPlus size={17} /> Criar minha conta</Link>
      </form>
    </section>
  </main>;
}
