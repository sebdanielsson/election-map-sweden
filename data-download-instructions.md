# Download instructions val.se

[Val.se - Teknisk beskrivning av resultatfiler](https://www.val.se/valresultat/europaparlamentet/2024/teknisk-beskrivning-av-resultatfiler.html)

[Val.se - Kartor över valdistrikt i val 2024](https://www.val.se/valresultat/europaparlamentet/2024/radata-och-statistik.html#kartor)

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
