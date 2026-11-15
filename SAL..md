# SAL 12/11/2026

Ottimo lavoro, ho cambiato il vite config perchè provando a fare test dal telefono facendo port forwarding
non trovava il backend, questo perchè vite fa fare le richieste al browser e, dato che il port forwarding è fatto solo 
su frontend, l'indirizzo non veniva trovato.
Anche se l'avesse trovato non avrebbe funzionato dato che il backend accetta solo richieste provenienti dall'ip del frontend.
Ora vite ha il proxy, quindi ogni chiamata che parte dal brower con /api/ passa dal frontend e viene effettuata da quest'ultimo.

``` js    
proxy: {
	// Browser calls /api/... on :4000, Vite forwards to the gateway on :8000.
	'/api': {
	target: env.BACKEND_URL,
	changeOrigin: true,
	ws: true,
	rewrite: (path) => path.replace(/^\/api/, ''),
	cookiePathRewrite: { '*': '/' },
	},
},
```

Le nuove end sono queste
``` env
VITE_API_URL=/api
BACKEND_URL=http://localhost:3000
```

### TO DO FRONTEND

- Mancano le traduzioni

- Manca la pagina di "ricerca avanzata"

- Bisognerebbe trovare un modo per avere la lista degli utenti bloccati per aver modo di sbloccarli

- Durante la registrazionw, quando ti chiede le preferenze fa delle call strane che falliscono (vedi console)

- Da sto problema ogni tanto (soprattutto sull'info btn nella swipe card):
  DiscoverPage.tsx:277 Error: Too many re-renders. React limits the number of renders to prevent an infinite loop.
  The above error occurred in the <ProfileSheet> component.
  React will try to recreate this component tree from scratch using the error boundary you provided, RenderErrorBoundary.

- Mappa
  - La mappa non renderizza le foto
  - La tab della mappa fa due richieste http
 
- anche la pagina activity fa due richieste http per MyLikes
- notifiche di errore troppo lunghe rompono la ui, praticamente sforando in larghezza e la pagina diventa "scorribbile" orizzontalmente

- Login
  - OAuh2 callback non funziona testando dal telefono, probabilmente c'è problema con gli indirizzi ip come il problema iniziale (Parliamone insieme)

- Discover
  - Disattiva discover se non l'utente non rispetta i requisiti base come avere una foto profilo

- Own profile
	- quando cambi sexioni (Photos/Details/Account) ti scrolla in alto all'inizio della pagina
	- le immagini di profilo non vengono renderizzate
	- rimuovere "Edit profile" btn, inutile dato che le info si modificano semplicemente scegliendo la tab
	- la stellina dovrebbe essere solo sull'immagine profile, ad ora credo sia in tutte tranne che quella
	- Tab Account
    	- rimuovere "Simulated"
    	- rimuovere "About this build"
- Matches
    - al caricamento della pagina viene fatta sia la chiamata a dicovery che a map (perchè?)
  
- User profile
    - Paris 18e che minghia è? leviamolo sembra il suo indirizzo di casa
    - i km di distanza non mi sembrano veri

- Activity
    - al caricamento della pagine vengono fatte mille richieste a caso (likes, map, discover, likes, likes)
    - viewer tab non funziona

- Notifiche
  - sembra che non ci sia la notifica di quando qualcuno ti mette like
  - it's a match ws notify dovrebbe apparire con l'animazione carina dovunque tu sia, ora lo fa solo se tu metti like a qualcuno che ti ha già messo like SOLO nella pagina activity
  
### TO DO BACKEND

[x] Controlla che quando si resetta la psw vengano revocati i jwt

- Implementare nuovo oaut2 method

- Un certo oAuth state viene inserito nei cookie dopo il login - con il logout non scompare