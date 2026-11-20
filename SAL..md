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

- Bisognerebbe trovare un modo per avere la lista degli utenti bloccati per aver modo di sbloccarli

- Durante la registrazione, quando ti chiede le preferenze fa delle call strane che falliscono (vedi console)
  
- notifiche di errore troppo lunghe rompono la ui, praticamente sforando in larghezza e la pagina diventa "scorribbile" orizzontalmente

- Login
  - OAuh2 callback non funziona testando dal telefono, probabilmente c'è problema con gli indirizzi ip come il problema iniziale (Parliamone insieme)

- Discover 
  - Disattiva discover se non l'utente non rispetta i requisiti base come avere una foto profilo !IMPORTANTE!
		questo controllo va al caricamento della pagina

- Own profile
	- quando cambi sexioni (Photos/Details/Account) ti scrolla in alto all'inizio della pagina
	- rimuovere "Edit profile" btn, inutile dato che le info si modificano semplicemente scegliendo la tab
	- rifacciamo la grafica per settare l'immagine di profilo, io non ci capisco molto
	- Tab Account
		io leverei anche under the hood


- Matches
    - rifacciamo la call api tutte le volte che viene caricata la pagina
  
- User profile
    - cosa sono Shared? io lo leverei

- Activity
	- you visited api call isn't done when activiy page is loaded
    - al caricamento della pagine vengono fatte mille richieste a caso (validate profile viewers X3 map discover interess)
    - viewer tab non funziona
	- Quando arriva una visualizzazzione mettiamola in cima alla lista
	- il pass sul profilo non funziona, sembra che non faccia proprio la call

- Notifiche
  - sembra che non ci sia la notifica di quando qualcuno ti mette like nemmeno il match (dimmi se ci sono problemi con i ws)
  - it's a match ws notify dovrebbe apparire con l'animazione carina dovunque tu sia, ora lo fa solo se tu metti like a qualcuno che ti ha già messo like SOLO nella pagina activity
  - SEE WHO btn non funziona
  - Unmatch notify non viene mostrata, IL SUBJECT LO RICHIEDE
  - Controlla che quando si clicca su una notifica, chiusa eventuali modal prima di rimandare alla pagina

-Calendar (è na hit zio can)

  
### TO DO BACKEND

- Implementare nuovo oaut2 method

- Un certo oAuth state viene inserito nei cookie dopo il login - con il logout non scompare

- Calendar
	se l'invitato fa DECLINE, l'invitante poi cancella l'evento, all'invitato non deve arrivare la notifica di cancellazione
