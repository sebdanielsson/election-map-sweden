# Download instructions val.se

[Val.se - Teknisk beskrivning av resultatfiler](https://www.val.se/valresultat/europaparlamentet/2024/teknisk-beskrivning-av-resultatfiler.html)

[Val.se - Kartor över valdistrikt i val 2024](https://www.val.se/valresultat/europaparlamentet/2024/radata-och-statistik.html#kartor)

## Election results

cd into the directory where you want to download the data. For example: `public/data/election-results`.

```shell
# Download the election results from val.se
curl -o EU-val_2024_slutlig_00_E.zip https://resultat.val.se/resultatfiler/euval2024/s/e/EU-val_2024_slutlig_00_E.zip
unzip EU-val_2024_slutlig_00_E.zip
rm EU-val_2024_slutlig_00_E.zip

# Verify the signature
curl -o ExpiTrust-EID-CA-v4.cer https://eid.expisoft.se/wp-content/uploads/2020/05/ExpiTrust-EID-CA-v4.cer
openssl x509 -inform der -in ExpiTrust-EID-CA-v4.cer -out ExpiTrust-EID-CA-v4.pem
curl -o val-sign-crt.pem https://resultat.val.se/keys/val-sign-crt.pem
openssl verify -CAfile ExpiTrust-EID-CA-v4.pem val-sign-crt.pem

# Verify the signature of the election results
openssl x509 -pubkey -noout -in val-sign-crt.pem > public_key.pem
for json_file in *.json; do sign_file="${json_file%.json}_sign.sha256"; [ -f "$sign_file" ] && openssl dgst -sha256 -verify public_key.pem -signature "$sign_file" "$json_file"; done

# Manual check: openssl dgst -sha256 -verify public_key.pem -signature EU-val_2024_slutlig_rostfordelning_00_E_sign.sha256 EU-val_2024_slutlig_rostfordelning_00_E.json
```

The data is now downloaded and verified. You can now use the data in your project.

## District maps

`download-districts` takes an election id (see `scripts/elections.ts` for the known ids)
and an output directory; `transform-geojson` takes an input and an output directory.
Districts are redrawn between elections, so each election has its own geometry — keep them
in separate directories.

```shell
# Download the raw archives (EPSG:3006) for one election
pnpm run download-districts riksdag-2026 temp/districts/riksdag-2026

# Reproject to WGS84, normalise the properties and drop the fields nothing reads
pnpm run transform-geojson temp/districts/riksdag-2026 public/data/districts/riksdag-2026
```

## Trimming result files

Valmyndigheten's rostfordelning files carry every field they publish; the map reads four of
them, and the difference is 146 MB against 7. Trim before uploading:

```shell
pnpm run trim-results <input.json> <output.json>
```

The script refuses any file carrying a `test` field, and any file with a district missing
its `valdistriktskod`.
