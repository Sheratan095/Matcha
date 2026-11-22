# SAL 12/11/2026

Ottimo lavoro, ho cambiato il vite config perchè provando a fare test dal telefono facendo port forwarding
non trovava il backend, questo perchè vite fa fare le richieste al browser e, dato che il port forwarding è fatto solo 
su frontend, l'indirizzo non veniva trovato.
Anche se l'avesse trovato non avrebbe funzionato dato che il backend accetta solo richieste provenienti dall'ip del frontend.
Ora vite ha il proxy, quindi ogni chiamata che parte dal brower con /api/ passa dal frontend e viene effettuata da quest'ultimo.

grz

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
  
- Login
  - OAuh2 callback non funziona testando dal telefono, probabilmente c'è problema con gli indirizzi ip come il problema iniziale (Parliamone insieme)

- Discover 

- Own profile
	- rimuovere "Edit profile" btn, inutile dato che le info si modificano semplicemente scegliendo la tab
	- rifacciamo la grafica per settare l'immagine di profilo, io non ci capisco molto

- Matches
    - rifacciamo la call api tutte le volte che viene caricata la pagina
  
- User profile
    - cosa sono Shared? io lo leverei
    - va mostrato il FAME RATING da subject

-Chat
    - non funziona il block, l'api call va fatta in POST e non in GET


- Activity
	- Quando arriva una visualizzazzione mettiamola in cima alla lista
	- io leverei notifications
	- you visited lo leverei, se lo vogliamo lasciare mettiamolo stile insta quando clicchi sulla search, di default ci sono i profili che hai visitato, poi digitando appaiono i match

- Notifiche
  - sembra che non ci sia la notifica di quando qualcuno ti mette like nemmeno il match (dimmi se ci sono problemi con i ws)
  - it's a match ws notify dovrebbe apparire con l'animazione carina dovunque tu sia, ora lo fa solo se tu metti like a qualcuno che ti ha già messo like SOLO nella pagina activity
  - Controlla che quando si clicca su una notifica, chiusa eventuali modal prima di rimandare alla pagina, stessa roba per la search bar

-Calendar (è na hit zio can)

- Zio pera il photo edit
  
### TO DO BACKEND

- Implementare nuovo oaut2 method

- Un certo oAuth state viene inserito nei cookie dopo il login - con il logout non scompare
