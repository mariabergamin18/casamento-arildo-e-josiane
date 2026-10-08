# Arildo & Josiane — Nossas memórias

Site do casamento com convite, câmera com moldura e envio privado de fotos para o Google Drive.

## Páginas

- `/`: site completo, convite e moldura de fotos.
- `/enviar-fotos`: página exclusiva de envio de fotos, para o QR Code das mesas.
- `/api/photos`: função de servidor que entrega as fotos ao Google Apps Script.

## Publicar na Vercel

1. Importe este repositório na Vercel. Framework: **Other**. A pasta de saída `public` e a função de servidor são configuradas em `vercel.json`.
2. Em Settings → Environment Variables, configure `DRIVE_UPLOAD_URL` com a URL `/exec` do aplicativo da web existente e `DRIVE_UPLOAD_KEY` com a propriedade `CHAVE_ENVIO` do Apps Script. Configure o ambiente Production; mantenha a chave secreta.
3. Publique ou faça um novo deploy depois de configurar as variáveis.
4. Teste `/enviar-fotos` em uma aba anônima: escolha uma foto, envie e confirme sua chegada à pasta privada no Drive.
5. Gere o QR Code com a URL de produção seguida de `/enviar-fotos`. Mantenha esse domínio e essa rota para preservar o QR impresso.

Os próximos commits na branch de produção `main` disparam deploys automáticos quando o repositório estiver conectado à Vercel.

## Integração existente

A integração com o Google Apps Script já foi configurada no projeto original. Não recrie a implantação nem execute a configuração do álbum se for reutilizá-la. O arquivo `integrations/GoogleAppsScript.gs` é uma referência sem chave e com o ID da pasta substituído por um marcador.

Para uma instalação nova, substitua o marcador da pasta, execute `configurarAlbum`, autorize o Drive e implante como aplicativo da web executando como proprietário, acessível a qualquer pessoa. A chave fica nas propriedades do Apps Script e nas variáveis de servidor da Vercel, nunca no navegador ou no GitHub.

## Comportamento e limites

- Até 10 fotos selecionadas por vez; cada foto é enviada em uma requisição separada.
- Imagens são convertidas para JPEG com qualidade 0,9 e lado máximo de 2400 px, como no site original; não são preservadas como arquivos originais.
- A versão Vercel limita o payload a aproximadamente 4,2 MB para respeitar o limite da plataforma. Fotos acima desse limite recebem uma mensagem para escolher uma versão menor.
- Identificadores persistem durante tentativas na mesma sessão para evitar duplicatas no Drive.
- A referência do Apps Script contém um limite de 300 fotos/dia. Confira o valor na implantação existente antes do evento.
- Fotos recebidas ficam no Drive privado; não há galeria pública.

As chaves e URLs de integração são configuradas no servidor. Este repositório não contém credenciais.
