import Head from 'next/head';
import '../styles/globals.css';

// A tag viewport é o que faz o celular renderizar na largura real da tela em
// vez de fingir um desktop de ~980px e espremer o conteúdo numa coluna com
// sobra à direita (bug visual real visto no Android em 25/07/2026). O Next
// não a inclui sozinho em Pages Router — tem que declarar aqui.
export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Prospecção Gratuita</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
