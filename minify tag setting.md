- commit 1 und 2: besseres Cache Handling für Tags (nicht unbedingt relevant für minify)

- commit 4: 
		- Spezialfall von Support Assistant (".support.js")
		- performance-verbesserung für denselben PR
- commit 5: partial revert von commit 4
------------------------



Weitere Schritte:
- ✅ erste beide commits erstmal entfernen (*)
- minify.js: 45-60: vereinfachen (kam durch 4 & 5)

- tag setting: JSON.stringify() & JSON.parse() überdenken
	- generell die Struktur mit dem String überdenken
- Kommentare über ganzen Commit anpassen/entfernen

(-alles in Summe anschauen)




---
(* können in neuen PR)
