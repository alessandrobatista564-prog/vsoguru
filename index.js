require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Partials
} = require('discord.js');
const fs = require('fs');

const DB_PATH = './rewards_db.json';

function loadRewardsDB() {
    if (!fs.existsSync(DB_PATH)) return [];
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch(e) { return []; }
}

function saveRewardsDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

let activeReward = null;
let rewardPaused = false;

// Mapa para rastrear quem assumiu cada ticket: channelId -> { userId, username }
const ticketAssumedBy = new Map();
// ✅ NOVO: guarda "assumido por" por userId do dono do ticket
const userTicketStaff = new Map();

const REWARD_ROLES = [
    { label: 'Pic Perm',      id: '1514769815712038913', emoji: '📷' },
    { label: 'Scout',         id: '1514769814764388482', emoji: '⚽' },
    { label: 'Scrim Hoster',  id: '1514769817142427678', emoji: '🔱' },
    { label: 'Vip Gold',      id: '1515910652273627176', emoji: '💰' },
    { label: 'Vip Prata',     id: '1515910764509266022', emoji: '⭐' },
    { label: 'Vip Bronze',    id: '1515910834558075041', emoji: '🏦' }
];

const REWARD_ADMIN_ROLES = [
    '1514769809597005839', 
    '1514769810817290422', 
    '1514769811807277136', 
    '1514769812780220467', 
    '1515491977297133770',
    '1514769808208695428',
];

const PAUSE_ROLE_ID = '1514769809597005839';

const STAFF_ROLES = [
    '1514769809597005839',
    '1514769810817290422',
    '1514769811807277136',
    '1514769812780220467',
    '1514769808208695428',
    '1514769813921337545',
    '1515491977297133770'
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Channel, Partials.Message] 
});

client.on('ready', async () => {
    console.log(`✅ Bot online e logado como: ${client.user.tag}`);
    
    setInterval(async () => {
        let db = loadRewardsDB();
        const now = Date.now();
        let changed = false;
        
        for (let i = db.length - 1; i >= 0; i--) {
            if (now >= db[i].expiresAt) {
                try {
                    const guild = client.guilds.cache.get(db[i].guildId);
                    if (guild) {
                        const member = await guild.members.fetch(db[i].userId).catch(() => null);
                        if (member) {
                            await member.roles.remove(db[i].roleId).catch(() => {});
                            console.log(`⏳ Cargo ${db[i].roleId} removido do usuário ${db[i].userId} por expiração.`);
                        }
                    }
                } catch(err) { console.error('Erro ao remover cargo expirado:', err); }
                
                db.splice(i, 1);
                changed = true;
            }
        }
        if (changed) saveRewardsDB(db);
    }, 60 * 60 * 1000);

    const panelChannelId = '1514769852248887536';
    try {
        const channel = await client.channels.fetch(panelChannelId);
        if (channel) {
            const messages = await channel.messages.fetch({ limit: 10 });
            
            const hasPanel = messages.some(m => 
                m.author.id === client.user.id && 
                m.components.length > 0 && 
                m.components[0].components[0].customId === 'menu_ticket'
            );

            if (!hasPanel) {
                console.log('📌 Painel de tickets não encontrado no canal. Enviando um novo...');
                
                const embedBanner = new EmbedBuilder()
                    .setColor('#005cff')
                    .setImage('https://cdn.discordapp.com/attachments/1515889144549740686/1515889850816008303/file_000000009a3c720eb09977a0e0f97906.png?ex=6a30a5f0&is=6a2f5470&hm=2a0b0984f5c6371a90d4efc1c22babf4b135b029883da8c53dcade63aeded7fe&'); 

                const embedTexto = new EmbedBuilder()
                    .setColor('#005cff')
                    .setAuthor({ name: 'Sistema de Atendimento Automático', iconURL: client.user.displayAvatarURL() })
                    .setDescription('# 🎟️ Central de Suporte e Ajuda\n' +
                                    'Seja muito bem-vindo(a) à nossa central! Utilize o menu interativo abaixo para selecionar o departamento que melhor atende à sua necessidade.\n\n' +
                                    '***\n' +
                                    '> ⏱️ **Atendimento 24/7** — Nossa plataforma nunca dorme.\n' +
                                    '> 📌 **Agilidade** — Tempo médio de resposta de até 10 minutos!\n' +
                                    '> 🤝 **Respeito Mútuo** — Exigimos educação com nossos atendentes.\n' +
                                    '***')
                    .setTimestamp()
                    .setFooter({ text: 'SPTA — Ticket System V2' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('menu_ticket')
                            .setPlaceholder('📋 Selecione o departamento desejado...')
                            .addOptions([
                                { label: 'Partner',   description: 'Assuntos sobre parcerias e divulgações',   value: 'ticket_Partner',   emoji: '🤝' },
                                { label: 'Denúncias', description: 'Reportar infrações ou má conduta',         value: 'ticket_Denúncias', emoji: '🚨' },
                                { label: 'Dúvidas',   description: 'Esclarecer dúvidas sobre o servidor',      value: 'ticket_Dúvidas',   emoji: '❓' },
                                { label: 'Ownar',     description: 'Assuntos diretamente relacionados a Ownar',value: 'ticket_Ownar',     emoji: '👑' },
                                { label: 'Cargos',    description: 'Informações sobre cargos, compras e VIPs', value: 'ticket_Cargos',    emoji: '💎' }
                            ])
                    );

                await channel.send({ embeds: [embedBanner, embedTexto], components: [row] });
                console.log('✅ Painel de tickets enviado automaticamente com sucesso!');
            } else {
                console.log('📌 O painel de tickets já está no canal, pulando envio.');
            }
        }
    } catch (err) {
        console.error('❌ Erro ao tentar enviar o painel automático no canal:', err);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- COMANDO !pause ---
    if (message.content === '!pause') {
        await message.delete().catch(() => {});

        const hasPauseRole = message.member?.roles.cache.has(PAUSE_ROLE_ID);
        if (!hasPauseRole) {
            const msgError = await message.channel.send(`❌ ${message.author}, você não possui permissão para usar este comando!`);
            setTimeout(() => msgError.delete().catch(() => {}), 5000);
            return;
        }

        const statusAtual = rewardPaused
            ? '⏸️ **Status atual:** Sistema de Rewards está **PAUSADO**.'
            : '▶️ **Status atual:** Sistema de Rewards está **ATIVO**.';

        const embedPause = new EmbedBuilder()
            .setColor('#005cff')
            .setAuthor({ name: '⚙️ Gerenciar Sistema de Rewards', iconURL: client.user.displayAvatarURL() })
            .setDescription(`O que deseja fazer?\n\n${statusAtual}`)
            .setTimestamp();

        const rowPause = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_pause_rewards')
                    .setLabel('Pausar')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⏸️')
                    .setDisabled(rewardPaused),
                new ButtonBuilder()
                    .setCustomId('btn_unpause_rewards')
                    .setLabel('Despausar')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️')
                    .setDisabled(!rewardPaused)
            );

        try {
            await message.author.send({ embeds: [embedPause], components: [rowPause] });
        } catch (err) {
            const msg = await message.channel.send(`⚠️ ${message.author}, sua DM está fechada! Abra para receber o painel de controle.`);
            setTimeout(() => msg.delete().catch(() => {}), 8000);
        }
        return;
    }

    // --- VERIFICA RESPOSTA DO REWARD ATIVO ---
    if (activeReward && message.channel.id === activeReward.channelId) {
        if (rewardPaused) return;

        if (message.content.toLowerCase().trim() === activeReward.answer) {
            const winner = message.author;
            const guildId = activeReward.guildId;
            
            if (activeReward.timeoutId) clearTimeout(activeReward.timeoutId);
            activeReward = null;
            
            const embedVencedor = new EmbedBuilder()
                .setColor('#00ce5d')
                .setAuthor({ name: '🎉 TEMOS UM VENCEDOR!', iconURL: client.user.displayAvatarURL() })
                .setDescription(`**CORRETO!** Parabéns ${winner}, você foi o primeiro a acertar a resposta e venceu o Reward!\n\n> 🎁 Verifique suas **Mensagens Diretas (PV)** para escolher e resgatar seu cargo exclusivo.`)
                .setThumbnail(winner.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            await message.reply({ embeds: [embedVencedor] });

            const embedDM = new EmbedBuilder()
                .setColor('#ffcc00')
                .setAuthor({ name: '🏆 Você venceu o Reward!', iconURL: client.user.displayAvatarURL() })
                .setDescription('Parabéns por ser o mais rápido a responder a pergunta no chat!\n\n**Escolha abaixo qual cargo você deseja receber como recompensa:**')
                .setTimestamp();

            const roleOptions = REWARD_ROLES.map(role => ({
                label: role.label,
                value: role.id,
                emoji: role.emoji
            }));

            const rowCargos = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`reward_role_select_${guildId}`)
                        .setPlaceholder('Selecione seu novo cargo...')
                        .addOptions(roleOptions)
                );
            
            await winner.send({ embeds: [embedDM], components: [rowCargos] }).catch((err) => {
                console.error('Erro ao enviar recompensa na DM:', err);
                message.channel.send(`⚠️ ${winner}, ocorreu um erro ao enviar a recompensa na sua DM. Consulte o console para mais detalhes.`);
            });
            return;
        }
    }

    // --- COMANDO +rewards ---
    if (message.content === '+rewards') {
        await message.delete().catch(() => {});

        if (message.member) {
            const hasPerm = message.member.roles.cache.some(r => REWARD_ADMIN_ROLES.includes(r.id));
            if (!hasPerm) {
                const msgError = await message.channel.send(`❌ ${message.author}, você não possui nenhum dos cargos necessários para criar um Reward!`);
                setTimeout(() => msgError.delete().catch(() => {}), 5000);
                return;
            }
        }

        if (rewardPaused) {
            const msgError = await message.channel.send(`⏸️ ${message.author}, o sistema de Rewards está **pausado** no momento! Aguarde ser reativado.`);
            setTimeout(() => msgError.delete().catch(() => {}), 6000);
            return;
        }

        if (activeReward) {
            const msgError = await message.channel.send(`⚠️ ${message.author}, já existe um evento Reward em andamento! Aguarde ele finalizar ou expirar.`);
            setTimeout(() => msgError.delete().catch(() => {}), 5000);
            return;
        }

        const creatorId  = message.author.id;
        const creatorTag = message.author.tag;

        // ✅ FIX 1: Usa "|" como separador para evitar conflito com "_" nos IDs
        const safeCustomId = `btn_setup_reward|${message.guild.id}|${message.channel.id}|${creatorId}`;

        const rowSetup = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(safeCustomId)
                .setLabel('Configurar Pergunta e Resposta')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⚙️')
        );
        
        try {
            const embedSetup = new EmbedBuilder()
                .setColor('#005cff')
                .setAuthor({ name: '🔧 Painel de Configuração do Reward', iconURL: message.guild.iconURL() })
                .setDescription(`Você solicitou a criação de um evento no canal <#${message.channel.id}> do servidor **${message.guild.name}**.\n\nClique no botão abaixo para definir a pergunta e a resposta do evento de forma totalmente invisível para os membros.`)
                .setTimestamp();

            await message.author.send({ embeds: [embedSetup], components: [rowSetup] });
        } catch (err) {
            const msg = await message.channel.send({ content: `⚠️ ${message.author}, sua DM (Mensagens Diretas) está fechada! Abra para eu poder enviar o painel de configuração de forma privada.` });
            setTimeout(() => msg.delete().catch(()=> {}), 10000);
        }
    }
});

client.on('interactionCreate', async interaction => {

    // --- PAUSAR REWARDS ---
    if (interaction.isButton() && interaction.customId === 'btn_pause_rewards') {
        rewardPaused = true;

        if (activeReward) {
            if (activeReward.timeoutId) clearTimeout(activeReward.timeoutId);
            activeReward = null;
        }

        const embedPausado = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('⏸️ **Sistema de Rewards pausado com sucesso!**\n\nNenhum novo reward poderá ser criado ou respondido até que seja despausado.');

        const rowAtualizada = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_pause_rewards')
                    .setLabel('Pausar')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⏸️')
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('btn_unpause_rewards')
                    .setLabel('Despausar')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️')
                    .setDisabled(false)
            );

        await interaction.update({ embeds: [embedPausado], components: [rowAtualizada] });
    }

    // --- DESPAUSAR REWARDS ---
    if (interaction.isButton() && interaction.customId === 'btn_unpause_rewards') {
        rewardPaused = false;

        const embedAtivo = new EmbedBuilder()
            .setColor('#00ce5d')
            .setDescription('▶️ **Sistema de Rewards reativado com sucesso!**\n\nO sistema voltou ao normal e novos rewards já podem ser criados.');

        const rowAtualizada = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_pause_rewards')
                    .setLabel('Pausar')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⏸️')
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('btn_unpause_rewards')
                    .setLabel('Despausar')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️')
                    .setDisabled(true)
            );

        await interaction.update({ embeds: [embedAtivo], components: [rowAtualizada] });
    }
    
    // --- 1. ABRIR TICKET ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_ticket') {
        const categoria = interaction.values[0].replace('ticket_', ''); 
        const ticketName = `${categoria}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

        const existingChannel = interaction.guild.channels.cache.find(c => c.name === ticketName);
        if (existingChannel) {
            return interaction.reply({ content: `❌ Você já possui um atendimento em andamento no canal ${existingChannel}!`, ephemeral: true });
        }

        const channel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            topic: `${interaction.user.id}-${categoria}`, 
            permissionOverwrites: [
                { id: interaction.guild.id,  deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id,   allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                { id: client.user.id,        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                ...STAFF_ROLES.map(roleId => ({
                    id: roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles]
                }))
            ],
        });

        await interaction.reply({ content: `✅ Seu ticket do departamento de **${categoria}** foi criado com sucesso em ${channel}!`, ephemeral: true });

        const embedTicket = new EmbedBuilder()
            .setColor('#005cff')
            .setAuthor({ name: `Departamento: ${categoria}`, iconURL: interaction.guild.iconURL() })
            .setDescription(`Olá ${interaction.user}, seja muito bem-vindo(a) ao seu ticket de atendimento!\n\n` +
                            `Para agilizar o processo, **por favor, descreva detalhadamente** o motivo do seu contato. Caso possua prints ou vídeos, você já pode enviá-los aqui.\n\n` +
                            `***\n` +
                            `> 🛡️ **Aguarde pacientemente,** nossa equipe já foi notificada.\n` +
                            `> 🚫 **Evite mencionar a Staff sem extrema necessidade.**\n` +
                            `***`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
            .setTimestamp()
            .setFooter({ text: `Ticket aberto por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        const rowTicket = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('assumir_ticket')
                    .setLabel('Assumir Ticket')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🙋'),
                new ButtonBuilder()
                    .setCustomId('fechar_ticket')
                    .setLabel('Encerrar Atendimento')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await channel.send({ content: `||${interaction.user}||`, embeds: [embedTicket], components: [rowTicket] });
    }

    // --- 2. ASSUMIR TICKET ---
    if (interaction.isButton() && interaction.customId === 'assumir_ticket') {
        const isStaff = interaction.member.roles.cache.some(r => STAFF_ROLES.includes(r.id));
        if (!isStaff) {
            return interaction.reply({ content: '❌ Apenas membros da Staff podem assumir um ticket.', ephemeral: true });
        }

        // ✅ FIX 2: Registra quem assumiu o ticket
        ticketAssumedBy.set(interaction.channel.id, {
            userId: interaction.user.id,
            username: interaction.user.tag
        });

        const rowAtualizada = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('assumir_ticket')
                    .setLabel(`Assumido por ${interaction.user.username}`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('fechar_ticket')
                    .setLabel('Encerrar Atendimento')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await interaction.update({ components: [rowAtualizada] });

        const embedAssumido = new EmbedBuilder()
            .setColor('#00ce5d')
            .setDescription(`🙋 ${interaction.user} **assumiu este ticket** e em breve irá te atender!`);

        await interaction.channel.send({ embeds: [embedAssumido] });
    }

    // --- 3. FECHAR TICKET ---
    if (interaction.isButton() && interaction.customId === 'fechar_ticket') {
        const topic = interaction.channel.topic;
        if (!topic || !topic.includes('-')) {
            return interaction.reply({ content: '❌ Erro: Tópico inválido, não consegui achar o dono original do ticket.', ephemeral: true });
        }

        const [userId, categoria] = topic.split('-');

        // ✅ FIX 2: Pega quem assumiu (ou indica que ninguém assumiu)
        const assumedInfo = ticketAssumedBy.get(interaction.channel.id);
        const assumidoPorTexto = assumedInfo
            ? `<@${assumedInfo.userId}> (${assumedInfo.username})`
            : 'Ninguém assumiu';

        // ✅ NOVO: salva para usar no log da avaliação depois (por userId do dono)
        userTicketStaff.set(userId, assumedInfo ? assumedInfo.username : 'Ninguém assumiu');

        // Limpa o registro do canal após fechar
        ticketAssumedBy.delete(interaction.channel.id);

        try {
            const user = await client.users.fetch(userId);
            
            const embedDM = new EmbedBuilder()
                .setColor('#005cff')
                .setAuthor({ name: 'Atendimento Concluído', iconURL: client.user.displayAvatarURL() })
                .setDescription(`Olá! Seu ticket da categoria **${categoria}** foi marcado como resolvido e encerrado em nosso servidor.\n\n` +
                                `A sua opinião é o que nos faz evoluir! Por favor, dedique **alguns segundos** para selecionar uma nota no menu abaixo e nos dizer como foi a sua experiência conosco.`)
                .addFields(
                    { name: '🙋 Atendido por', value: assumidoPorTexto, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Agradecemos a sua preferência!', iconURL: interaction.guild ? interaction.guild.iconURL() : client.user.displayAvatarURL() });

            const rowAvaliacao = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`avaliar_${categoria}`)
                        .setPlaceholder('⭐ Selecione uma nota para o atendimento...')
                        .addOptions([
                            { label: '5 Estrelas', description: 'Excelente! Problema totalmente resolvido.', value: '5', emoji: '🤩' },
                            { label: '4 Estrelas', description: 'Muito Bom! Fui bem atendido.',              value: '4', emoji: '😁' },
                            { label: '3 Estrelas', description: 'Bom. Atendeu às expectativas.',             value: '3', emoji: '😐' },
                            { label: '2 Estrelas', description: 'Ruim. Deixou a desejar.',                   value: '2', emoji: '🙁' },
                            { label: '1 Estrela',  description: 'Péssimo. Não gostei do atendimento.',       value: '1', emoji: '😡' }
                        ])
                );

            await user.send({ embeds: [embedDM], components: [rowAvaliacao] });
        } catch (err) {
            console.log("Não foi possível enviar DM para o usuário. DM Fechada.");
        }

        await interaction.reply({ content: '🗑️ O ticket foi encerrado e o canal será deletado em instantes...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

    // --- 4. SELECIONOU A NOTA NA DM -> ABRE O MODAL ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('avaliar_')) {
        const categoria = interaction.customId.replace('avaliar_', '');
        const nota = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`modal_nota_${nota}_cat_${categoria}`) 
            .setTitle('📝 Motivo da Avaliação');

        const motivoInput = new TextInputBuilder()
            .setCustomId('motivo_input')
            .setLabel('Por que você nos deu essa nota?')
            .setPlaceholder('Descreva brevemente sua experiência para nos ajudar a melhorar...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
        await interaction.showModal(modal);
    }

    // --- 5. RECEBE O MODAL (MOTIVO) E LOGA A AVALIAÇÃO ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_nota_')) {
        const parts = interaction.customId.split('_'); 
        const nota = parts[2];
        const categoria = parts[4];
        const motivo = interaction.fields.getTextInputValue('motivo_input');

        const embedObrigado = new EmbedBuilder()
            .setColor('#00ce5d')
            .setDescription('✅ **Muito obrigado pelo seu feedback!** Ele é extremamente importante para mantermos a qualidade do nosso servidor.');

        await interaction.reply({ embeds: [embedObrigado] });

        const canalAvaliacoesId = process.env.AVALIACOES_CHANNEL_ID;
        if (canalAvaliacoesId) {
            const canalLog = client.channels.cache.get(canalAvaliacoesId);
            if (canalLog) {
                    // ✅ NOVO: recupera quem atendeu esse usuário
                    const staffQueAtendeu = userTicketStaff.get(interaction.user.id) ?? 'Não registrado';
                    userTicketStaff.delete(interaction.user.id); // limpa após usar

                    const embedLog = new EmbedBuilder()
                        .setColor('#005cff')
                        .setAuthor({ name: 'Nova Avaliação Registrada', iconURL: interaction.user.displayAvatarURL() })
                        .setDescription('Uma nova avaliação de atendimento foi enviada no sistema!')
                        .addFields(
                            { name: '👤 Usuário',        value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                            { name: '📁 Departamento',   value: `\`${categoria}\``,                                  inline: true },
                            { name: '⭐ Nota Recebida',  value: `**${nota} Estrelas**`,                              inline: true },
                            { name: '🙋 Atendido por',   value: staffQueAtendeu,                                     inline: false },
                            { name: '📝 Motivo / Feedback', value: `> *"${motivo}"*` }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 512 }))
                        .setTimestamp()
                        .setFooter({ text: `ID do Usuário: ${interaction.user.id}`, iconURL: client.user.displayAvatarURL() });

                    await canalLog.send({ embeds: [embedLog] });
            }
        }
    }

    // --- 6. BOTAO SETUP REWARD (Na DM) ---
    // ✅ FIX 1: Agora usa "|" como separador
    if (interaction.isButton() && interaction.customId.startsWith('btn_setup_reward|')) {
        if (rewardPaused) {
            return interaction.reply({ content: '⏸️ O sistema de Rewards foi **pausado** antes de você configurar o evento. Peça para despausar e tente novamente.', ephemeral: true });
        }

        const parts = interaction.customId.split('|');
        // customId: btn_setup_reward|GUILDID|CHANNELID|CREATORID
        const guildId    = parts[1];
        const channelId  = parts[2];
        const creatorId  = parts[3];

        const modal = new ModalBuilder()
            .setCustomId(`modal_reward|${guildId}|${channelId}|${creatorId}`)
            .setTitle('Criar Novo Reward');

        const perguntaInput = new TextInputBuilder()
            .setCustomId('reward_pergunta')
            .setLabel('Qual a pergunta?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);

        const respostaInput = new TextInputBuilder()
            .setCustomId('reward_resposta')
            .setLabel('Qual a resposta exata?')
            .setPlaceholder('O bot vai validar exatamente o que estiver aqui.')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        modal.addComponents(
            new ActionRowBuilder().addComponents(perguntaInput),
            new ActionRowBuilder().addComponents(respostaInput)
        );
        
        await interaction.showModal(modal);
    }

    // --- 7. RECEBE O MODAL DA DM E INICIA O REWARD NO SERVIDOR ---
    // ✅ FIX 1: Agora usa "|" como separador
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reward|')) {
        if (rewardPaused) {
            return interaction.reply({ content: '⏸️ O sistema de Rewards está **pausado**. O evento não foi iniciado.', ephemeral: true });
        }

        const parts = interaction.customId.split('|');
        // customId: modal_reward|GUILDID|CHANNELID|CREATORID
        const guildId   = parts[1];
        const channelId = parts[2];
        const creatorId = parts[3];

        const pergunta = interaction.fields.getTextInputValue('reward_pergunta');
        const resposta = interaction.fields.getTextInputValue('reward_resposta');
        const answerClean = resposta.toLowerCase().trim();

        // ✅ FIX 1: Busca o tag do criador corretamente com o ID limpo
        let creatorTag = 'Desconhecido';
        try {
            const creatorUser = await client.users.fetch(creatorId);
            creatorTag = creatorUser.tag;
        } catch (_) {}

        const timeoutId = setTimeout(async () => {
            if (activeReward && activeReward.channelId === channelId) {
                activeReward = null;
                try {
                    const guild   = client.guilds.cache.get(guildId);
                    const channel = guild.channels.cache.get(channelId);
                    const embedExpirou = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setAuthor({ name: '⏳ REWARD EXPIRADO!', iconURL: client.user.displayAvatarURL() })
                        .setDescription(`Ninguém conseguiu adivinhar a tempo!\n\n> 💡 **A resposta correta era:** \`${resposta}\``)
                        .setTimestamp();
                    await channel.send({ embeds: [embedExpirou] });
                } catch (e) { console.log("Erro ao expirar evento", e); }
            }
        }, 90000);

        activeReward = {
            channelId,
            guildId,
            answer: answerClean,
            timeoutId
        };

        const embedReward = new EmbedBuilder()
            .setColor('#ff0055')
            .setAuthor({ name: '🎁 EVENTO REWARD!', iconURL: client.user.displayAvatarURL() })
            .setDescription(`**Pergunta:**\n> ${pergunta}\n\n*O primeiro a mandar a resposta certa no chat leva o prêmio!*\n\n⏳ **Atenção:** O evento expira automaticamente em 1 minuto e meio!`)
            .setTimestamp()
            .setFooter({ text: `Reward por: ${creatorTag}` });

        try {
            const guild   = client.guilds.cache.get(guildId);
            const channel = guild.channels.cache.get(channelId);

            await channel.send({
                content: '@here',
                embeds: [embedReward],
                allowedMentions: { parse: ['everyone'] }
            });

            await interaction.reply({ content: '✅ O evento reward foi iniciado com sucesso no servidor!', ephemeral: true });
        } catch (err) {
            console.log(err);
            await interaction.reply({ content: '❌ Erro ao tentar enviar o evento no servidor. O bot tem permissão de enviar mensagens lá?', ephemeral: true });
        }
    }

    // --- 8. USUARIO ESCOLHE O CARGO NA DM ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('reward_role_select_')) {
        const guildId = interaction.customId.replace('reward_role_select_', '');
        const roleId  = interaction.values[0];

        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return interaction.reply({ content: '❌ Erro: Não encontrei o servidor.', ephemeral: true });

            const member = await guild.members.fetch(interaction.user.id);
            if (!member) return interaction.reply({ content: '❌ Erro: Você não está mais no servidor.', ephemeral: true });

            if (roleId.startsWith('ID_AQUI_')) {
                return interaction.reply({ content: '⚠️ **Aviso:** O Administrador do bot ainda não configurou os IDs reais dos cargos. Avise-o!', ephemeral: true });
            }

            await member.roles.add(roleId);
            
            const db = loadRewardsDB();
            db.push({
                userId: interaction.user.id,
                guildId: guild.id,
                roleId: roleId,
                expiresAt: Date.now() + (10 * 24 * 60 * 60 * 1000)
            });
            saveRewardsDB(db);
            
            const unixExp = Math.floor((Date.now() + (10 * 24 * 60 * 60 * 1000)) / 1000);
            const embedSucesso = new EmbedBuilder()
                .setColor('#00ce5d')
                .setDescription(`✅ **Sucesso!** O cargo foi adicionado à sua conta no servidor **${guild.name}**!\n\n⏳ *Este cargo é temporário e será removido automaticamente da sua conta em <t:${unixExp}:R>.*`);
                
            await interaction.update({ embeds: [embedSucesso], components: [] });

        } catch (err) {
            console.log(err);
            await interaction.reply({ content: '❌ Houve um erro ao tentar te dar o cargo. O cargo do bot precisa estar acima do cargo que ele vai entregar, e ele precisa de permissão de "Gerenciar Cargos".', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);