- [x] remove wavebinder dependencies
- [x] remove support without backend
- [ ] Automatic(test) card creation needs to be handled in a more customizable approach. ex(asset usage)
- [ ] design needs heavy adjustement on mobile side
- [ ] User map shared among friends (leaflet implementation)
- [ ] design document draft
- [ ] location fetching at runtime
- [x] UPDATE Registration requirements (docs/auth_flow.md):
	Username: 3-20 chars, allowed chars: [a-z, A-Z, 0-9, '_', '.'],
	Psw: 8-128 chars, exlcluded popular passwords, In db: hashed
	Email: max 100 chars, In db: trimmed, lowercased and UNIQUE
- [x] Date of birth at registration
  
- [ ] BROWSING
- [ ] FILTERS are done in BACKEND, SORT is done in FRONEND
- [ ] user would be able to sort by age, location(distance with you), fame rating, common tags(count)
- [ ] remove online status in cards
- [ ] remove common interets tags list
- [ ] common interests count is used only for sort
  
- [ ] remove the manual verification code entering now verification and psw reset works only with link