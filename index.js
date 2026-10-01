require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Discord Bot is Online 24/7!');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
const { 
    Client, 
    GatewayIntentBits, 
    Events, 
    PermissionsBitField, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType
} = require('discord.js');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration 
    ]
});

// ================= HỆ THỐNG ĐỌC VÀ LƯU FILE CỨNG JSON CHỐNG MẤT DATA =================
const WARNS_FILE = './warnsDatabase.json';
const BOOST_FILE = './boostChannelsDatabase.json';
const BOOST_TICKET_FILE = './boostTicketChannelsDatabase.json';
const ADMINS_FILE = './dynamicAdmins.json';
const MANAGERS_FILE = './dynamicManagers.json';
const DNT_FILE = './dntDatabase.json';
const ROLE_ANCHOR_FILE = './roleAnchorDatabase.json';
const RANK_CHANNELS_FILE = './rankChannelsDatabase.json';
const RANK_FILE = './rankDatabase.json';

function readJSON(filePath, defaultData) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error(`Lỗi đọc file ${filePath}:`, error);
    }
    return defaultData;
}

function writeJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
    } catch (error) {
        console.error(`Lỗi ghi file ${filePath}:`, error);
    }
}

const rawWarns = readJSON(WARNS_FILE, {});
const warnsDatabase = new Map(Object.entries(rawWarns));

const rawBoosts = readJSON(BOOST_FILE, {});
const boostChannelsDatabase = new Map(Object.entries(rawBoosts));

const rawBoostTickets = readJSON(BOOST_TICKET_FILE, {});
const boostTicketChannelsDatabase = new Map(Object.entries(rawBoostTickets));

const rawDnt = readJSON(DNT_FILE, {});
const dntDatabase = new Map(Object.entries(rawDnt));

const rawRoleAnchors = readJSON(ROLE_ANCHOR_FILE, {});
const roleAnchorDatabase = new Map(Object.entries(rawRoleAnchors));

const rawRankChannels = readJSON(RANK_CHANNELS_FILE, {});
const rankChannelsDatabase = new Map(Object.entries(rawRankChannels));

const rawRanks = readJSON(RANK_FILE, {});
const rankDatabase = new Map(Object.entries(rawRanks));

let dynamicAdmins = readJSON(ADMINS_FILE, []);
let dynamicManagers = readJSON(MANAGERS_FILE, []);

function saveMapToFile(mapInstance, filePath) {
    const obj = {};
    for (const [key, value] of mapInstance.entries()) {
        obj[key] = value;
    }
    writeJSON(filePath, obj);
}

function parseAmount(input) {
    if (!input) return null;
    const cleanInput = input.trim().toLowerCase().replace(/,/g, '');
    const match = cleanInput.match(/^(\d+(\.\d+)?)([kmb])?$/);
    if (!match) return null;

    let num = parseFloat(match[1]);
    const unit = match[3];

    if (unit === 'k') num *= 1000;
    else if (unit === 'm') num *= 1000000;
    else if (unit === 'b') num *= 1000000000;

    return Math.floor(num);
}

function formatCurrency(amount) {
    return amount.toLocaleString('vi-VN');
}

// DANH SÁCH CHỦ SỞ HỮU TỐI CAO
const PRIMARY_OWNER_ID = '715825553504075868';
const ALLOWED_USERS = [PRIMARY_OWNER_ID, 'twl1ghtt_'];

function isPrimaryOwner(user) {
    return user.id === PRIMARY_OWNER_ID;
}

function isOwner(user) {
    return ALLOWED_USERS.includes(user.id) || ALLOWED_USERS.includes(user.username) || dynamicAdmins.includes(user.id);
}

function isManager(user) {
    return isOwner(user) || dynamicManagers.includes(user.id);
}

function blendHexColors(color1, color2) {
    const c1 = color1.replace('#', '');
    const c2 = color2.replace('#', '');

    const r1 = parseInt(c1.substring(0, 2), 16);
    const g1 = parseInt(c1.substring(2, 4), 16);
    const b1 = parseInt(c1.substring(4, 6), 16);

    const r2 = parseInt(c2.substring(0, 2), 16);
    const g2 = parseInt(c2.substring(2, 4), 16);
    const b2 = parseInt(c2.substring(4, 6), 16);

    const rBlended = Math.floor((r1 + r2) / 2).toString(16).padStart(2, '0');
    const gBlended = Math.floor((g1 + g2) / 2).toString(16).padStart(2, '0');
    const bBlended = Math.floor((b1 + b2) / 2).toString(16).padStart(2, '0');

    return `#${rBlended}${gBlended}${bBlended}`;
}

// KHỞI TẠO SLASH COMMAND /TSAY
const slashCommands = [
    new SlashCommandBuilder()
        .setName('tsay')
        .setDescription('Gửi tin nhắn ẩn danh qua Bot tới kênh chỉ định (Chỉ Admin/Owner)')
        .addChannelOption(option => 
            option.setName('kenh')
                .setDescription('Chọn kênh chat bạn muốn Bot gửi tin nhắn tới')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addStringOption(option => 
            option.setName('noidung')
                .setDescription('Nội dung muốn Bot nói')
                .setRequired(true)
        )
].map(command => command.toJSON());

client.once(Events.ClientReady, async () => {
    console.log(`Bot đã online thành công với tên: ${client.user.tag}`);
    
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] }).catch(() => null);

        for (const guild of client.guilds.cache.values()) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guild.id),
                { body: slashCommands }
            ).catch(() => null);
        }
        console.log('Đã đồng bộ thành công Slash Command /tsay!');
    } catch (error) {
        console.error('Lỗi đăng ký Slash Command:', error);
    }
});

// ================= HỆ THỐNG ANTI-NUKE / ANTI-RAID BẢO VỆ SERVER =================
const deletedChannelsMap = new Map();
const bannedMembersMap = new Map();
const kickedMembersMap = new Map();

client.on(Events.ChannelDelete, async (channel) => {
    if (!channel.guild) return;
    const guild = channel.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: 12 }).catch(() => null);
    const entry = auditLogs?.entries.first();

    if (!entry || !entry.executor || entry.executor.id === client.user.id) return;
    if (isPrimaryOwner(entry.executor)) return;

    const executorId = entry.executor.id;
    const now = Date.now();
    const userHistory = deletedChannelsMap.get(executorId) || [];
    
    const recentDeletes = userHistory.filter(timestamp => now - timestamp < 10000);
    recentDeletes.push(now);
    deletedChannelsMap.set(executorId, recentDeletes);

    if (recentDeletes.length >= 2) {
        const member = await guild.members.fetch(executorId).catch(() => null);
        if (member && member.bannable) {
            await member.ban({ reason: 'Phát hiện hành vi Raid: Xóa nhiều kênh liên tục trong 10 giây' }).catch(() => null);
            console.log(`[ANTI-RAID] Đã ban ${member.user.tag} vì hành vi xóa kênh hàng loạt.`);
        }
    }
});

client.on(Events.GuildBanAdd, async (ban) => {
    const guild = ban.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: 22 }).catch(() => null);
    const entry = auditLogs?.entries.first();

    if (!entry || !entry.executor || entry.executor.id === client.user.id) return;
    if (isPrimaryOwner(entry.executor)) return;

    const executorId = entry.executor.id;
    const now = Date.now();
    const userHistory = bannedMembersMap.get(executorId) || [];

    const recentBans = userHistory.filter(timestamp => now - timestamp < 10000);
    recentBans.push(now);
    bannedMembersMap.set(executorId, recentBans);

    if (recentBans.length >= 2) {
        const member = await guild.members.fetch(executorId).catch(() => null);
        if (member && member.bannable) {
            await member.ban({ reason: 'Phát hiện hành vi Raid: Ban hàng loạt thành viên trong 10 giây' }).catch(() => null);
            console.log(`[ANTI-RAID] Đã ban ${member.user.tag} vì hành vi Ban hàng loạt.`);
        }
    }
});

client.on(Events.GuildMemberRemove, async (member) => {
    const guild = member.guild;
    const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: 20 }).catch(() => null);
    const entry = auditLogs?.entries.first();

    if (!entry || !entry.executor || entry.executor.id === client.user.id) return;
    if (isPrimaryOwner(entry.executor)) return;

    if (entry.target && entry.target.id === member.id && (Date.now() - entry.createdTimestamp < 5000)) {
        const executorId = entry.executor.id;
        const now = Date.now();
        const userHistory = kickedMembersMap.get(executorId) || [];

        const recentKicks = userHistory.filter(timestamp => now - timestamp < 10000);
        recentKicks.push(now);
        kickedMembersMap.set(executorId, recentKicks);

        if (recentKicks.length >= 3) {
            const adminMember = await guild.members.fetch(executorId).catch(() => null);
            if (adminMember && adminMember.bannable) {
                await adminMember.ban({ reason: 'Phát hiện hành vi Raid: Kick hàng loạt thành viên trong 10 giây' }).catch(() => null);
                console.log(`[ANTI-RAID] Đã ban ${adminMember.user.tag} vì hành vi Kick hàng loạt.`);
            }
        }
    }
});

// Xử lý sự kiện tương tác
client.on(Events.InteractionCreate, async (interaction) => {
    // XỬ LÝ SLASH COMMAND /TSAY
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'tsay') {
            if (!isOwner(interaction.user)) {
                return interaction.reply({ 
                    content: '❌ Bạn không có quyền `tadmin` để sử dụng lệnh này.', 
                    flags: 64 
                }).catch(() => null);
            }

            const targetChannel = interaction.options.getChannel('kenh');
            const content = interaction.options.getString('noidung');

            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.reply({ 
                    content: '❌ Kênh được chọn không hợp lệ hoặc không phải là kênh văn bản.', 
                    flags: 64 
                }).catch(() => null);
            }

            try {
                await targetChannel.send({ content: content });
                return interaction.reply({ 
                    content: `✅ Đã gửi tin nhắn đến kênh <#${targetChannel.id}> thành công!`, 
                    flags: 64 
                }).catch(() => null);
            } catch (err) {
                return interaction.reply({ 
                    content: '❌ Bot không thể gửi tin nhắn vào kênh này (Thiếu quyền gửi tin nhắn).', 
                    flags: 64 
                }).catch(() => null);
            }
        }
        return;
    }

    if (!interaction.isStringSelectMenu()) return;

    if (!isManager(interaction.user)) {
        return interaction.reply({ content: 'Bạn không có quyền sử dụng hệ thống menu quản trị của Bot này.', flags: 64 }).catch(() => null);
    }

    const guildId = interaction.guild.id;
    const DIVIDER_BANNER = 'https://media.discordapp.net/attachments/1118836262409027664/1118836371775520778/animated_divider.gif';

    // ================= XỬ LÝ MENU DỌC CHO TMENUQUANLY =================
    if (interaction.customId === 'select_manager_menu_category') {
        const category = interaction.values[0];
        let menuEmbed = new EmbedBuilder().setImage(DIVIDER_BANNER).setTimestamp();

        if (category === 'mgr_roles') {
            menuEmbed
                .setColor('#1ABC9C')
                .setTitle('🛠️ QUẢN LÝ VAI TRÒ (ROLES)')
                .addFields(
                    { name: '👉 tcreate <Tên Role> <@tag/ID> <Màu Hex 1> [Màu Hex 2] [Emoji]', value: 'Tạo vai trò mới (hỗ trợ pha màu kép). Có thể đính kèm ảnh, reply ảnh/emoji/sticker để làm icon cho role.' },
                    { name: '👉 tadd <@tag/ID> <Tên/ID Role>', value: 'Cấp nhanh vai trò đã chọn cho thành viên.' },
                    { name: '👉 tdelete <@tag/ID> <Tên/ID Role>', value: 'Thu hồi nhanh vai trò khỏi thành viên.' }
                );
        } 
        else if (category === 'mgr_punish') {
            menuEmbed
                .setColor('#E74C3C')
                .setTitle('⚖️ CẢNH CÁO & XỬ LÝ (MODERATION)')
                .addFields(
                    { name: '👉 twarn <@tag/ID> [Lý do]', value: 'Phạt cảnh cáo thành viên, lưu dữ liệu DB và tự gửi DM thông báo riêng cho người bị phạt.' },
                    { name: '👉 twarn', value: 'Mở danh sách thả xuống kiểm tra chi tiết lịch sử cảnh cáo.' },
                    { name: '👉 tunwarn', value: 'Bật menu phân cấp 2 bước để gỡ lỗi cảnh cáo công khai.' },
                    { name: '👉 tmute <@tag> <Thời gian> [Lý do] / tunmute <@tag>', value: 'Khóa mõm tạm thời thành viên (Tối đa 28 ngày) hoặc mở khóa sớm.' },
                    { name: '👉 tban <@tag> [Lý do] / tunban <ID>', value: 'Cấm vĩnh viễn hoặc gỡ cấm cho thành viên bằng ID.' }
                );
        } 
        else if (category === 'mgr_dnt') {
            menuEmbed
                .setColor('#F1C40F')
                .setTitle('💰 QUẢN LÝ DNT (DONATE)')
                .addFields(
                    { name: '👉 ctydnt <@user/ID> <Số tiền>', value: 'Cộng thêm số tiền DNT cho thành viên (Ví dụ: `ctydnt 882501111804743721 20k`, `100k`, `1m`).' },
                    { name: '👉 ctydnt', value: 'Xem chi tiết lịch sử ủng hộ của từng người và mở menu chọn xóa lần DNT nhập sai.' },
                    { name: '👉 cty dnt board', value: 'Xem Bảng xếp hạng các thành viên ủng hộ Donate nhiều nhất.' }
                );
        } 
        else if (category === 'mgr_media') {
            menuEmbed
                .setColor('#3498DB')
                .setTitle('🔮 EMOJI, STICKER & TIỆN ÍCH')
                .addFields(
                    { name: '👉 temoji [Tên mới]', value: 'Reply vào tin nhắn có emoji server khác để nhân bản về server hiện tại.' },
                    { name: '👉 tsticker [Tên mới]', value: 'Reply vào tin nhắn có sticker để lấy link gốc hoặc nhân bản về server.' },
                    { name: '👉 tphotoemj <Tên_Emoji>', value: 'Upload ảnh trực tiếp hoặc reply vào tin nhắn chứa ảnh để tạo thành Emoji mới.' },
                    { name: '👉 tphotostk <Tên_Sticker>', value: 'Upload ảnh trực tiếp hoặc reply vào tin nhắn chứa ảnh để tạo thành Sticker mới.' }
                );
        }

        await interaction.message.delete().catch(() => null);

        const replyMsg = await interaction.reply({ embeds: [menuEmbed], fetchReply: true }).catch(() => null);
        if (replyMsg) {
            setTimeout(() => {
                replyMsg.delete().catch(() => null);
            }, 15000);
        }
        return;
    }

    // ================= XỬ LÝ MENU XEM CẤU HÌNH TLIST =================
    if (interaction.customId === 'select_tlist_category') {
        if (!isOwner(interaction.user)) {
            return interaction.reply({ content: 'Bạn không có quyền xem cấu hình này.', flags: 64 }).catch(() => null);
        }
        const selectedOpt = interaction.values[0];
        let resultMsg = '';

        if (selectedOpt === 'list_admins') {
            if (dynamicAdmins.length === 0) {
                resultMsg = '👑 **Admin động:** Hiện tại chưa có thành viên nào được cấp quyền admin động.';
            } else {
                const listTags = dynamicAdmins.map(id => `<@${id}> (ID: \`${id}\`)`).join('\n');
                resultMsg = `👑 **Danh sách Admin động của Bot:**\n${listTags}`;
            }
        } 
        else if (selectedOpt === 'list_boost') {
            const boostChId = boostChannelsDatabase.get(guildId);
            resultMsg = boostChId ? `💜 **Kênh thông báo Nitro Boost (` + "`tbooston`" + `):** <#${boostChId}>` : `💜 **Kênh thông báo Nitro Boost:** Chưa được thiết lập.`;
        } 
        else if (selectedOpt === 'list_ticket') {
            const ticketChId = boostTicketChannelsDatabase.get(guildId);
            resultMsg = ticketChId ? `🎫 **Kênh tạo Ticket Boost (` + "`tboostticket`" + `):** <#${ticketChId}>` : `🎫 **Kênh tạo Ticket Boost:** Chưa được thiết lập.`;
        } 
        else if (selectedOpt === 'list_rank') {
            const rankChs = rankChannelsDatabase.get(guildId) || [];
            if (rankChs.length === 0) {
                resultMsg = `📊 **Kênh hoạt động Rank (` + "`ctysetrank`" + `):** Chưa có kênh nào được bật.`;
            } else {
                const chTags = rankChs.map(id => `<#${id}>`).join(', ');
                resultMsg = `📊 **Danh sách kênh hoạt động tính Rank/EXP:**\n${chTags}`;
            }
        } 
        else if (selectedOpt === 'list_anchor') {
            const anchorId = roleAnchorDatabase.get(guildId);
            if (!anchorId) {
                resultMsg = `📌 **Vai trò mốc tự động (` + "`troleon`" + `):** Đang tắt (Dùng vị trí mặc định).`;
            } else {
                const roleObj = interaction.guild.roles.cache.get(anchorId);
                const roleName = roleObj ? roleObj.name : `ID: ${anchorId}`;
                resultMsg = `📌 **Vai trò mốc tự động xếp (` + "`troleon`" + `):** <@&${anchorId}> (${roleName})`;
            }
        }

        return interaction.update({ content: resultMsg, components: interaction.message.components }).catch(() => null);
    }

    // ================= XỬ LÝ MENU HƯỚNG DẪN TMENU DẠNG EMBED =================
    if (interaction.customId === 'select_bot_menu_category') {
        const category = interaction.values[0];
        let menuEmbed = new EmbedBuilder().setImage(DIVIDER_BANNER).setTimestamp();

        if (category === 'menu_roles') {
            menuEmbed
                .setColor('#1ABC9C')
                .setTitle('🛠️ QUẢN LÝ VAI TRÒ (ROLES)')
                .addFields(
                    { name: '👉 tcreate <Tên Role> <@tag/ID> <Màu Hex 1> [Màu Hex 2] [Emoji]', value: 'Tạo vai trò mới (hỗ trợ màu kép). Có thể đính kèm ảnh, reply ảnh/emoji/sticker để làm icon cho role.' },
                    { name: '👉 troleon <ID/Tag Role>', value: 'Thiết lập vai trò mốc. Mọi role tạo từ `tcreate` sau đó sẽ tự động được kéo lên nằm ngay trên mốc này.' },
                    { name: '👉 troleoff', value: 'Tắt tính năng tự động kéo vị trí vai trò khi tạo bằng `tcreate`.' },
                    { name: '👉 tadd <@tag/ID> <Tên/ID Role>', value: 'Cấp nhanh vai trò đã chọn cho thành viên.' },
                    { name: '👉 tdelete <@tag/ID> <Tên/ID Role>', value: 'Thu hồi nhanh vai trò khỏi thành viên.' }
                );
        } 
        else if (category === 'menu_warns') {
            menuEmbed
                .setColor('#F1C40F')
                .setTitle('⚠️ PHẠT CẢNH CÁO (WARNS)')
                .addFields(
                    { name: '👉 twarn', value: 'Gọi danh sách thả xuống kiểm tra chi tiết các thành viên đang có lịch sử phạt.' },
                    { name: '👉 twarn <@tag/ID> [Lý do]', value: 'Phạt cảnh cáo thành viên, lưu dữ liệu DB và tự gửi DM thông báo riêng cho người bị phạt.' },
                    { name: '👉 tunwarn', value: 'Bật menu phân cấp 2 bước (Chọn người -> Chọn lỗi) để xóa gỡ bỏ lỗi phạt công khai.' }
                );
        } 
        else if (category === 'menu_boost') {
            menuEmbed
                .setColor('#9B59B6')
                .setTitle('💜 NITRO BOOST, VIP, DNT & RANK')
                .addFields(
                    { name: '👉 tlist', value: 'Xem nhanh tổng hợp cấu hình server (Admin, Kênh Boost, Kênh Rank, Role mốc,...).' },
                    { name: '👉 tbooston / tboostoff', value: 'Bật / Tắt hệ thống gửi lời cảm ơn Nitro Boost tự động.' },
                    { name: '👉 tboostticket <ID/Tag Kênh>', value: 'Cài đặt kênh tạo ticket nhận đặc quyền của Booster.' },
                    { name: '👉 ctysetrank / ctyunsetrank', value: 'Bật / Gỡ kênh chat hoạt động tính EXP.' },
                    { name: '👉 ctyrank / ctytop / ctyresetrank', value: 'Xem Rank cá nhân, Bảng xếp hạng Top EXP hoặc Reset rank server.' },
                    { name: '👉 tboostinfo / tvipinfo / tvipinfo2 / tvip8info -> tvip10info', value: 'Hiển thị các bảng đặc quyền Nitro Boost và gói VIP 1 -> VIP 10.' },
                    { name: '👉 ctydnt <@user/ID> <Số tiền> / ctydnt / cty dnt board', value: 'Cộng/trừ DNT, xem lịch sử Donate hoặc xem Bảng xếp hạng Top DNT (Dành cho Quản lý & Admin).' }
                );
        } 
        else if (category === 'menu_mods') {
            menuEmbed
                .setColor('#E74C3C')
                .setTitle('🛡️ QUẢN TRỊ SERVER & ADMIN')
                .addFields(
                    { name: '👉 tadmin / tadmin <@user> / tadminoff <@user>', value: 'Xem, Cấp hoặc Gỡ quyền Admin động toàn năng cho Bot (Chỉ Owner chính).' },
                    { name: '👉 tquanly / tquanly <@user> / tquanlyoff <@user>', value: 'Xem danh sách, Cấp hoặc Gỡ quyền Quản lý (được dùng Mute, Ban, Warn, Role, Emoji, Sticker, DNT...).' },
                    { name: '👉 /tsay hoặc tsay <kênh> <nội dung>', value: 'Dùng lệnh ẩn danh qua Bot để gửi tin nhắn/tag tới kênh chỉ định (Chỉ Admin/Owner).' },
                    { name: '👉 tmenuquanly', value: 'Xem bảng tra cứu dạng Menu dọc dành riêng cho Quản lý.' },
                    { name: '👉 tkick <@tag> [Lý do]', value: 'Trục xuất thành viên khỏi server.' },
                    { name: '👉 tban <@tag> [Lý do] / tunban <ID>', value: 'Cấm vĩnh viễn hoặc gỡ cấm cho thành viên bằng ID.' },
                    { name: '👉 tmute <@tag> <Thời gian> [Lý do] / tunmute <@tag>', value: 'Khóa mõm tạm thời thành viên (Tối đa 28 ngày) hoặc mở khóa sớm.' }
                );
        } 
        else if (category === 'menu_utilities') {
            menuEmbed
                .setColor('#3498DB')
                .setTitle('🔮 TIỆN ÍCH & NHÂN BẢN')
                .addFields(
                    { name: '👉 em ea em', value: 'Tương tác trò chuyện câu thoại ngắn vui nhộn với Bot.' },
                    { name: '👉 temoji [Tên mới]', value: 'Reply vào tin nhắn có emoji server khác để nhân bản về server hiện tại.' },
                    { name: '👉 tsticker [Tên mới]', value: 'Reply vào tin nhắn có sticker để lấy link gốc hoặc nhân bản về server.' },
                    { name: '👉 tphotoemj <Tên_Emoji>', value: 'Upload ảnh trực tiếp hoặc reply vào tin nhắn chứa ảnh để tạo thành Emoji mới.' },
                    { name: '👉 tphotostk <Tên_Sticker>', value: 'Upload ảnh trực tiếp hoặc reply vào tin nhắn chứa ảnh để tạo thành Sticker mới.' }
                );
        }

        await interaction.message.delete().catch(() => null);

        const replyMsg = await interaction.reply({ embeds: [menuEmbed], fetchReply: true }).catch(() => null);

        if (replyMsg) {
            setTimeout(() => {
                replyMsg.delete().catch(() => null);
            }, 10000);
        }
        return;
    }

    // HÀNH ĐỘNG 1: Xem chi tiết lịch sử warn của lệnh twarn
    if (interaction.customId === 'select_warned_user') {
        const targetId = interaction.values[0];
        const guildWarns = warnsDatabase.get(guildId) || [];
        const userWarns = guildWarns.filter(w => w.userId === targetId);

        if (userWarns.length === 0) {
            return interaction.reply({ content: 'Thành viên này hiện không có lịch sử cảnh cáo.', flags: 64 }).catch(() => null);
        }

        let detailMsg = ` Lịch sử cảnh cáo của <@${targetId}>:\n`;
        userWarns.forEach((warn, index) => {
            detailMsg += `**Lần ${index + 1}:**\n 📅 Ngày: *${warn.date}*\n Lý do: \`${warn.reason}\`\n Người phạt: <@${warn.moderatorId}>\n\n`;
        });

        await interaction.message.delete().catch(() => null);

        const replyMsg = await interaction.reply({ content: detailMsg, fetchReply: true }).catch(() => null);

        if (replyMsg) {
            setTimeout(() => {
                replyMsg.delete().catch(() => null);
            }, 10000);
        }
    }

    // HÀNH ĐỘNG 2: Lệnh tunwarn bước 1 - Chọn user muốn unwarn
    if (interaction.customId === 'unwarn_select_user') {
        const targetId = interaction.values[0];
        const guildWarns = warnsDatabase.get(guildId) || [];
        const userWarns = guildWarns.filter(w => w.userId === targetId);

        if (userWarns.length === 0) {
            return interaction.reply({ content: 'Thành viên này hiện không có lịch sử cảnh cáo để gỡ.', flags: 64 }).catch(() => null);
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('unwarn_select_error')
            .setPlaceholder('--- Chọn lỗi warn muốn xóa bỏ ---');

        userWarns.forEach((warn) => {
            const shortReason = warn.reason.length > 50 ? warn.reason.substring(0, 47) + '...' : warn.reason;
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Lý do: ${shortReason}`)
                    .setDescription(`Ngày: ${warn.date}`)
                    .setValue(`${targetId}_${warn.id}`)
            );
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        await interaction.message.delete().catch(() => null);

        await interaction.reply({
            content: `🔍 Dưới đây là danh sách lỗi của <@${targetId}>. Vui lòng chọn 1 lỗi để gỡ bỏ công khai:`,
            components: [row]
        }).catch(() => null);
    }

    // HÀNH ĐỘNG 3: Lệnh tunwarn bước 2 - Chọn lỗi muốn xóa hẳn khỏi DB
    if (interaction.customId === 'unwarn_select_error') {
        const [targetId, warnId] = interaction.values[0].split('_');
        let guildWarns = warnsDatabase.get(guildId) || [];
        
        const warnIndex = guildWarns.findIndex(w => w.userId === targetId && w.id.toString() === warnId);
        
        if (warnIndex === -1) {
            return interaction.reply({ content: 'Không tìm thấy hoặc lỗi này đã được gỡ bỏ từ trước.', flags: 64 }).catch(() => null);
        }

        const removedWarn = guildWarns[warnIndex];
        guildWarns.splice(warnIndex, 1);
        warnsDatabase.set(guildId, guildWarns);
        
        saveMapToFile(warnsDatabase, WARNS_FILE);

        await interaction.message.delete().catch(() => null);

        const replyMsg = await interaction.reply({
            content: `✅ Đã gỡ bỏ thành công 1 lỗi cảnh cáo của thành viên <@${targetId}>!\n👉 **Lỗi vừa xóa:** \`${removedWarn.reason}\` (Phạt ngày: *${removedWarn.date}*)`,
            fetchReply: true
        }).catch(() => null);

        if (replyMsg) {
            setTimeout(() => {
                replyMsg.delete().catch(() => null);
            }, 10000);
        }
    }

    // HÀNH ĐỘNG 4: Xem lịch sử DNT + Tích hợp Menu Xóa
    if (interaction.customId === 'select_dnt_user_history') {
        const targetUserId = interaction.values[0];
        const guildDnt = dntDatabase.get(guildId) || {};
        const userData = guildDnt[targetUserId];

        if (!userData || !userData.history || userData.history.length === 0) {
            return interaction.reply({ content: 'Không tìm thấy lịch sử ủng hộ của thành viên này.', flags: 64 }).catch(() => null);
        }

        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        const userName = member ? member.displayName : `User ${targetUserId}`;

        let historyMsg = `**LỊCH SỬ ĐÓNG GÓP DNT CỦA ${userName}:**\n\n`;
        historyMsg += `**Tổng cộng đã ủng hộ:** \`${formatCurrency(userData.total)} VNĐ\`\n\n`;

        const deleteMenu = new StringSelectMenuBuilder()
            .setCustomId('dnt_delete_select_entry')
            .setPlaceholder('--- Chọn lần DNT muốn xóa (Nếu nhập sai) ---');

        for (let idx = 0; idx < userData.history.length; idx++) {
            const item = userData.history[idx];
            const itemId = item.id || idx;

            const modMember = await interaction.guild.members.fetch(item.moderatorId).catch(() => null);
            const modName = modMember ? modMember.displayName : `User ${item.moderatorId}`;

            historyMsg += `**Lần ${idx + 1}:** +\`${formatCurrency(item.amount)} VNĐ\`\nNgày: *${item.date}* | Người duyệt: **${modName}**\n\n`;

            deleteMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Xóa Lần ${idx + 1}: +${formatCurrency(item.amount)} VNĐ`)
                    .setDescription(`Ngày cộng: ${item.date}`)
                    .setValue(`${targetUserId}_${itemId}`)
            );
        }

        const row = new ActionRowBuilder().addComponents(deleteMenu);

        await interaction.message.delete().catch(() => null);

        const replyMsg = await interaction.reply({
            content: historyMsg + '*Nếu có lần DNT nào bị nhập sai, hãy chọn ở menu bên dưới để xóa:*',
            components: [row],
            fetchReply: true
        }).catch(() => null);

        if (replyMsg) {
            setTimeout(() => {
                replyMsg.delete().catch(() => null);
            }, 10000);
        }
    }

    // HÀNH ĐỘNG 5: Thực hiện XÓA LẦN DNT NÀO ĐÓ KHỎI DB & TRỪ TIỀN
    if (interaction.customId === 'dnt_delete_select_entry') {
        const [targetUserId, itemIdStr] = interaction.values[0].split('_');
        let guildDnt = dntDatabase.get(guildId) || {};
        const userData = guildDnt[targetUserId];

        if (!userData || !userData.history || userData.history.length === 0) {
            return interaction.reply({ content: 'Dữ liệu đóng góp của thành viên này không tồn tại.', flags: 64 }).catch(() => null);
        }

        const itemIndex = userData.history.findIndex((item, idx) => (item.id ? item.id.toString() === itemIdStr : idx.toString() === itemIdStr));

        if (itemIndex === -1) {
            return interaction.reply({ content: 'Lần đóng góp này không tồn tại hoặc đã bị xóa trước đó.', flags: 64 }).catch(() => null);
        }

        const removedItem = userData.history[itemIndex];
        
        userData.total -= removedItem.amount;
        if (userData.total < 0) userData.total = 0;
        userData.history.splice(itemIndex, 1);

        if (userData.history.length === 0) {
            delete guildDnt[targetUserId];
        } else {
            guildDnt[targetUserId] = userData;
        }

        dntDatabase.set(guildId, guildDnt);
        saveMapToFile(dntDatabase, DNT_FILE);

        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        const userName = member ? member.displayName : `User ${targetUserId}`;

        await interaction.message.delete().catch(() => null);

        const replyMsg = await interaction.reply({
            content: `**ĐÃ XÓA LẦN DNT THÀNH CÔNG!**\nThành viên: **${userName}**\nĐã trừ: **-${formatCurrency(removedItem.amount)} VNĐ**\n**Tổng DNT còn lại:** **${formatCurrency(userData.total || 0)} VNĐ**`,
            fetchReply: true
        }).catch(() => null);

        if (replyMsg) {
            setTimeout(() => {
                replyMsg.delete().catch(() => null);
            }, 10000);
        }
    }
});

// Hàm xử lý khi có tin nhắn chat
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const fullContent = message.content.trim();
    const args = fullContent.split(/ +/);
    const command = args.shift().toLowerCase();

    const DIVIDER_BANNER = 'https://media.discordapp.net/attachments/1118836262409027664/1118836371775520778/animated_divider.gif';

    // ================= LỆNH TSAY DẠNG PREFIX =================
    if (command === 'tsay' || command === '/tsay') {
        if (!isOwner(message.author)) {
            const err = await message.reply('❌ Bạn không có quyền `tadmin` để dùng lệnh này.').catch(() => null);
            message.delete().catch(() => null);
            if (err) setTimeout(() => err.delete().catch(() => null), 5000);
            return;
        }

        const targetChannelInput = args[0];
        const content = args.slice(1).join(' ');

        if (!targetChannelInput || !content) {
            const guide = await message.reply('Cú pháp: `tsay <ID hoặc #kênh> <Nội dung>`').catch(() => null);
            message.delete().catch(() => null);
            if (guide) setTimeout(() => guide.delete().catch(() => null), 5000);
            return;
        }

        const cleanChannelId = targetChannelInput.replace(/[<#>]/g, '');
        const targetChannel = message.guild.channels.cache.get(cleanChannelId);

        if (!targetChannel || !targetChannel.isTextBased()) {
            const err = await message.reply('❌ Không tìm thấy kênh hoặc ID kênh không hợp lệ.').catch(() => null);
            message.delete().catch(() => null);
            if (err) setTimeout(() => err.delete().catch(() => null), 5000);
            return;
        }

        await targetChannel.send({ content: content }).catch(() => null);
        message.delete().catch(() => null);
        return;
    }

    // ================= HỆ THỐNG TÍNH EXP KHI CHAT =================
    const allowedRankChannels = rankChannelsDatabase.get(guildId) || [];
    if (allowedRankChannels.includes(message.channel.id)) {
        let guildRanks = rankDatabase.get(guildId) || {};
        if (!guildRanks[message.author.id]) {
            guildRanks[message.author.id] = { exp: 0 };
        }

        let userRank = guildRanks[message.author.id];
        userRank.exp += 1; 

        rankDatabase.set(guildId, guildRanks);
        saveMapToFile(rankDatabase, RANK_FILE);
    }

    // ================= LỆNH TMENUQUANLY (MENU DỌC DẠNG SELECT MENU) =================
    if (command === 'tmenuquanly') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_manager_menu_category')
            .setPlaceholder('--- Chọn cụm tính năng Quản lý bạn muốn xem ---')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('🛠️ Quản lý Vai trò (Roles)')
                    .setDescription('Xem tcreate (ảnh/icon), tadd, tdelete...')
                    .setValue('mgr_roles'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('⚖️ Cảnh cáo & Xử lý (Warn, Mute, Ban)')
                    .setDescription('Xem twarn, tunwarn, tmute, tunmute, tban, tunban...')
                    .setValue('mgr_punish'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('💰 Quản lý DNT (Donate)')
                    .setDescription('Xem ctydnt (+tiền, xóa sai), cty dnt board...')
                    .setValue('mgr_dnt'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🔮 Tiện ích, Emoji & Sticker')
                    .setDescription('Xem temoji, tsticker, tphotoemj, tphotostk...')
                    .setValue('mgr_media')
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const managerMainEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('💼 BẢNG LỆNH DÀNH CHO QUẢN LÝ (DYNAMIC MANAGER)')
            .setDescription('Vui lòng chọn cụm tính năng bạn được cấp quyền bên dưới để xem hướng dẫn chi tiết:')
            .setImage(DIVIDER_BANNER)
            .setFooter({ text: 'Tin nhắn tự động xóa sau 15 giây' })
            .setTimestamp();

        const managerMsg = await message.channel.send({
            embeds: [managerMainEmbed],
            components: [row],
            reply: { messageReference: message.id }
        }).catch(() => null);

        message.delete().catch(() => null);

        if (managerMsg) {
            setTimeout(() => {
                managerMsg.delete().catch(() => null);
            }, 15000);
        }
        return;
    }

    // ================= LỆNH TLIST =================
    if (command === 'tlist') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_tlist_category')
            .setPlaceholder('--- Chọn mục thiết lập server muốn xem ---')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('👑 Danh sách Admin động')
                    .setDescription('Xem những người được cấp quyền tadmin')
                    .setValue('list_admins'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('💜 Kênh thông báo Nitro Boost')
                    .setDescription('Xem kênh cấu hình tbooston')
                    .setValue('list_boost'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🎫 Kênh tạo Ticket Boost')
                    .setDescription('Xem kênh cấu hình tboostticket')
                    .setValue('list_ticket'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('📊 Kênh hoạt động Rank/EXP')
                    .setDescription('Xem danh sách kênh ctysetrank')
                    .setValue('list_rank'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('📌 Vai trò mốc sắp xếp (troleon)')
                    .setDescription('Xem mốc role tự động tạo tcreate')
                    .setValue('list_anchor')
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const listMsg = await message.channel.send({
            content: '📋 **Trung tâm Kiểm tra Cấu hình Server**: Vui lòng chọn danh mục bạn muốn tra cứu bên dưới:',
            components: [row]
        }).catch(() => null);

        message.delete().catch(() => null);

        if (listMsg) {
            setTimeout(() => {
                listMsg.delete().catch(() => null);
            }, 20000);
        }
        return;
    }

    // ================= LỆNH CTYSETRANK =================
    if (command === 'ctysetrank') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        let channelIds = [];
        message.mentions.channels.forEach(ch => channelIds.push(ch.id));
        
        args.forEach(arg => {
            const cleanId = arg.replace(/[<#>]/g, '');
            if (/^\d{17,19}$/.test(cleanId) && message.guild.channels.cache.has(cleanId) && !channelIds.includes(cleanId)) {
                channelIds.push(cleanId);
            }
        });

        if (channelIds.length === 0) {
            return message.reply('Vui lòng tag hoặc nhập ID các kênh cần bật tính năng rank (Ví dụ: `ctysetrank #kenh-chat` hoặc `ctysetrank 123456789`).').catch(() => null);
        }

        let currentChannels = rankChannelsDatabase.get(guildId) || [];
        channelIds.forEach(id => {
            if (!currentChannels.includes(id)) {
                currentChannels.push(id);
            }
        });

        rankChannelsDatabase.set(guildId, currentChannels);
        saveMapToFile(rankChannelsDatabase, RANK_CHANNELS_FILE);

        const channelTags = channelIds.map(id => `<#${id}>`).join(', ');
        const setupMsg = await message.reply(`✅ Đã thiết lập thành công các kênh hoạt động tính Rank/EXP: ${channelTags}`).catch(() => null);
        if (setupMsg) {
            setTimeout(() => setupMsg.delete().catch(() => null), 10000);
        }
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH CTYUNSETRANK =================
    if (command === 'ctyunsetrank') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const targetArg = args[0];
        if (!targetArg) {
            return message.reply('Vui lòng sử dụng đúng cú pháp: `ctyunsetrank all` hoặc `ctyunsetrank <#kenh hoặc ID>`.').catch(() => null);
        }

        let currentChannels = rankChannelsDatabase.get(guildId) || [];

        if (targetArg.toLowerCase() === 'all') {
            rankChannelsDatabase.delete(guildId);
            saveMapToFile(rankChannelsDatabase, RANK_CHANNELS_FILE);
            const unsetAllMsg = await message.reply('❌ Đã gỡ bỏ tính năng tính Rank ra khỏi **toàn bộ** các kênh trong server!').catch(() => null);
            if (unsetAllMsg) setTimeout(() => unsetAllMsg.delete().catch(() => null), 10000);
            message.delete().catch(() => null);
            return;
        }

        let channelIds = [];
        message.mentions.channels.forEach(ch => channelIds.push(ch.id));
        args.forEach(arg => {
            const cleanId = arg.replace(/[<#>]/g, '');
            if (/^\d{17,19}$/.test(cleanId) && !channelIds.includes(cleanId)) {
                channelIds.push(cleanId);
            }
        });

        if (channelIds.length === 0) {
            return message.reply('Vui lòng tag hoặc nhập đúng ID kênh cần gỡ (Hoặc dùng `ctyunsetrank all`).').catch(() => null);
        }

        let newChannels = currentChannels.filter(id => !channelIds.includes(id));
        rankChannelsDatabase.set(guildId, newChannels);
        saveMapToFile(rankChannelsDatabase, RANK_CHANNELS_FILE);

        const channelTags = channelIds.map(id => `<#${id}>`).join(', ');
        const unsetMsg = await message.reply(`❌ Đã gỡ bỏ tính năng tính Rank khỏi các kênh: ${channelTags}`).catch(() => null);
        if (unsetMsg) setTimeout(() => unsetMsg.delete().catch(() => null), 10000);
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH CTYRESETRANK =================
    if (command === 'ctyresetrank') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const targetArg = args[0];
        if (!targetArg) {
            return message.reply('Vui lòng sử dụng đúng cú pháp: `ctyresetrank all` hoặc `ctyresetrank <@user hoặc ID>`.').catch(() => null);
        }

        let guildRanks = rankDatabase.get(guildId) || {};

        if (targetArg.toLowerCase() === 'all') {
            rankDatabase.delete(guildId);
            saveMapToFile(rankDatabase, RANK_FILE);
            const resetAllMsg = await message.reply('🔄 Đã xóa sạch toàn bộ dữ liệu rank của tất cả thành viên trong server thành công!').catch(() => null);
            if (resetAllMsg) setTimeout(() => resetAllMsg.delete().catch(() => null), 10000);
            message.delete().catch(() => null);
            return;
        }

        const targetUserId = targetArg.replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(targetUserId)) {
            return message.reply('ID hoặc thành viên cần reset không hợp lệ.').catch(() => null);
        }

        if (guildRanks[targetUserId]) {
            delete guildRanks[targetUserId];
            rankDatabase.set(guildId, guildRanks);
            saveMapToFile(rankDatabase, RANK_FILE);
            const resetUserMsg = await message.reply(`🔄 Đã reset dữ liệu rank của thành viên <@${targetUserId}> thành công!`).catch(() => null);
            if (resetUserMsg) setTimeout(() => resetUserMsg.delete().catch(() => null), 10000);
        } else {
            const notFoundMsg = await message.reply('Thành viên này hiện chưa có dữ liệu rank nào trong hệ thống.').catch(() => null);
            if (notFoundMsg) setTimeout(() => notFoundMsg.delete().catch(() => null), 10000);
        }
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH CTYRANK =================
    if (command === 'ctyrank') {
        let targetUser = message.author;
        if (message.mentions.users.first()) {
            targetUser = message.mentions.users.first();
        } else if (message.reference) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMsg && !repliedMsg.author.bot) {
                    targetUser = repliedMsg.author;
                }
            } catch (err) {}
        }

        const guildRanks = rankDatabase.get(guildId) || {};
        const userEntries = Object.entries(guildRanks);

        userEntries.sort((a, b) => (b[1].exp || 0) - (a[1].exp || 0));

        const userRankIndex = userEntries.findIndex(entry => entry[0] === targetUser.id);
        const serverRank = userRankIndex !== -1 ? userRankIndex + 1 : 'Unranked';

        const userData = guildRanks[targetUser.id] || { exp: 0 };
        const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
        const displayName = member ? member.displayName : targetUser.username;
        const avatarUrl = targetUser.displayAvatarURL({ dynamic: true });

        const rankEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setAuthor({ name: displayName, iconURL: avatarUrl })
            .setDescription(`🎉 **#${serverRank}** | 💫 **${userData.exp || 0} EXP**`);

        message.delete().catch(() => null);
        const rankMsg = await message.channel.send({ embeds: [rankEmbed] }).catch(() => null);

        if (rankMsg) {
            setTimeout(() => {
                rankMsg.delete().catch(() => null);
            }, 10000);
        }
        return;
    }

    // ================= LỆNH CTYTOP / CTYTOPRANK =================
    if (command === 'ctytop' || command === 'ctytoprank') {
        const guildRanks = rankDatabase.get(guildId) || {};
        const userEntries = Object.entries(guildRanks);

        if (userEntries.length === 0) {
            return message.reply('Server hiện tại chưa có dữ liệu xếp hạng Rank nào.').catch(() => null);
        }

        userEntries.sort((a, b) => (b[1].exp || 0) - (a[1].exp || 0));

        const ITEMS_PER_PAGE = 10;
        const totalPages = Math.ceil(userEntries.length / ITEMS_PER_PAGE);
        let currentPage = 0;

        const generateTopEmbed = async (page) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentEntries = userEntries.slice(start, end);

            let description = '';
            for (let i = 0; i < currentEntries.length; i++) {
                const [userId, data] = currentEntries[i];
                const rank = start + i + 1;
                const member = await message.guild.members.fetch(userId).catch(() => null);
                const userName = member ? member.displayName : `User ${userId}`;

                description += `**Top ${rank}** - **${userName}** | EXP: \`${data.exp || 0}\`\n`;
            }

            return new EmbedBuilder()
                .setColor('#E67E22')
                .setTitle('🏆 BẢNG XẾP HẠNG TOP RANK (EXP)')
                .setDescription(description || 'Không có dữ liệu')
                .setImage(DIVIDER_BANNER)
                .setFooter({ text: `Trang ${page + 1}/${totalPages} • Tự động xóa sau 20 giây` })
                .setTimestamp();
        };

        const generateButtons = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_prev_rank_top')
                    .setLabel('Trang trước')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('btn_next_rank_top')
                    .setLabel('Trang sau')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1)
            );
        };

        const initialEmbed = await generateTopEmbed(currentPage);
        const componentsRow = totalPages > 1 ? [generateButtons(currentPage)] : [];

        const topMsg = await message.channel.send({
            embeds: [initialEmbed],
            components: componentsRow
        }).catch(() => null);

        message.delete().catch(() => null);
        if (!topMsg) return;

        let autoDeleteTimer = setTimeout(() => {
            topMsg.delete().catch(() => null);
        }, 20000);

        if (totalPages > 1) {
            const collector = topMsg.createMessageComponentCollector({ time: 20000 });

            collector.on('collect', async (btnInteraction) => {
                clearTimeout(autoDeleteTimer);
                autoDeleteTimer = setTimeout(() => {
                    topMsg.delete().catch(() => null);
                }, 20000);

                if (btnInteraction.customId === 'btn_prev_rank_top') {
                    if (currentPage > 0) currentPage--;
                } else if (btnInteraction.customId === 'btn_next_rank_top') {
                    if (currentPage < totalPages - 1) currentPage++;
                }

                const newEmbed = await generateTopEmbed(currentPage);
                const newButtons = generateButtons(currentPage);

                await btnInteraction.update({
                    embeds: [newEmbed],
                    components: [newButtons]
                }).catch(() => null);
            });
        }
        return;
    }

    // ================= LỆNH CÀI ĐẶT MỐC SẮP XẾP VAI TRÒ (TROLEON VÀ TROLEOFF) =================
    if (command === 'troleon') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const roleQuery = args.join(' ');
        if (!roleQuery) {
            return message.reply('Vui lòng nhập ID, tag vai trò hoặc tên vai trò mốc (Ví dụ: `troleon @Nhà đầu tư` hoặc `troleon 1234567890`).').catch(() => null);
        }

        const targetRoleId = roleQuery.replace(/[<@&>]/g, '');
        const anchorRole = message.guild.roles.cache.get(targetRoleId) || message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase());

        if (!anchorRole) {
            return message.reply(`Không tìm thấy vai trò nào ứng với thông tin \`${roleQuery}\`. Vui lòng kiểm tra lại.`).catch(() => null);
        }

        roleAnchorDatabase.set(guildId, anchorRole.id);
        saveMapToFile(roleAnchorDatabase, ROLE_ANCHOR_FILE);

        return message.reply(`✅ Đã bật tính năng tự động xếp vai trò! Mọi vai trò được tạo bằng \`tcreate\` từ giờ sẽ tự động được kéo lên nằm ngay **phía trên** vai trò **${anchorRole.name}**.`).catch(() => null);
    }

    if (command === 'troleoff') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        if (!roleAnchorDatabase.has(guildId)) {
            return message.reply('Tính năng tự động sắp xếp vị trí vai trò khi `tcreate` vốn đang tắt sẵn rồi.').catch(() => null);
        }

        roleAnchorDatabase.delete(guildId);
        saveMapToFile(roleAnchorDatabase, ROLE_ANCHOR_FILE);

        return message.reply('❌ Đã tắt tính năng tự động xếp vị trí vai trò. Các vai trò được tạo từ lệnh `tcreate` sau này sẽ nằm ở vị trí mặc định.').catch(() => null);
    }

    // ================= LỆNH THIẾT LẬP KÊN TICKET BOOST (TBOOSTTICKET) =================
    if (command === 'tboostticket') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const targetTicketChannelId = args[0] ? args[0].replace(/[<#>]/g, '') : null;
        if (!targetTicketChannelId) {
            return message.reply('Vui lòng nhập đúng ID kênh hoặc tag kênh ticket (Ví dụ: `tboostticket #kenh-ticket` hoặc `tboostticket 1526190691389149245`).').catch(() => null);
        }

        const checkChannel = message.guild.channels.cache.get(targetTicketChannelId);
        if (!checkChannel) {
            return message.reply('Tớ không tìm thấy kênh này trong server. Vui lòng kiểm tra lại ID.').catch(() => null);
        }

        boostTicketChannelsDatabase.set(guildId, targetTicketChannelId);
        saveMapToFile(boostTicketChannelsDatabase, BOOST_TICKET_FILE);

        return message.reply(`✅ Đã thiết lập kênh tạo ticket Boost thành công! Khi có người Boost server, Bot sẽ nhắc nhở họ tạo ticket tại <#${targetTicketChannelId}> để nhận role và room.`).catch(() => null);
    }

    // ================= LỆNH BẢNG XẾP HẠNG CTY DNT BOARD =================
    if (fullContent.toLowerCase() === 'cty dnt board' || fullContent.toLowerCase() === 'ctydntboard') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const guildDnt = dntDatabase.get(guildId) || {};
        const userEntries = Object.entries(guildDnt);

        if (userEntries.length === 0) {
            return message.reply('Server hiện tại chưa có dữ liệu đóng góp DNT nào.').catch(() => null);
        }

        userEntries.sort((a, b) => b[1].total - a[1].total);

        const ITEMS_PER_PAGE = 10;
        const totalPages = Math.ceil(userEntries.length / ITEMS_PER_PAGE);
        let currentPage = 0;

        const generateBoardEmbed = async (page) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentEntries = userEntries.slice(start, end);

            let description = '';
            for (let i = 0; i < currentEntries.length; i++) {
                const [userId, data] = currentEntries[i];
                const rank = start + i + 1;
                const member = await message.guild.members.fetch(userId).catch(() => null);
                const userName = member ? member.displayName : `User ${userId}`;

                description += `**Top ${rank}** - **${userName}**: \`${formatCurrency(data.total)} VNĐ\` (${data.history.length} lần)\n`;
            }

            return new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('BẢNG XẾP HẠNG THÀNH VIÊN DNT (DONATE)')
                .setDescription(description || 'Không có dữ liệu')
                .setImage(DIVIDER_BANNER)
                .setFooter({ text: `Trang ${page + 1}/${totalPages} • Tự động xóa sau 20 giây` })
                .setTimestamp();
        };

        const generateButtons = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_prev_dnt_board')
                    .setLabel('Trang trước')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('btn_next_dnt_board')
                    .setLabel('Trang sau')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1)
            );
        };

        const initialEmbed = await generateBoardEmbed(currentPage);
        const componentsRow = totalPages > 1 ? [generateButtons(currentPage)] : [];

        const boardMsg = await message.channel.send({
            embeds: [initialEmbed],
            components: componentsRow
        }).catch(() => null);

        message.delete().catch(() => null);
        if (!boardMsg) return;

        let autoDeleteTimer = setTimeout(() => {
            boardMsg.delete().catch(() => null);
        }, 20000);

        if (totalPages > 1) {
            const collector = boardMsg.createMessageComponentCollector({ time: 20000 });

            collector.on('collect', async (btnInteraction) => {
                if (!isManager(btnInteraction.user)) {
                    return btnInteraction.reply({ content: 'Bạn không có quyền chuyển trang bảng này.', flags: 64 }).catch(() => null);
                }

                clearTimeout(autoDeleteTimer);
                autoDeleteTimer = setTimeout(() => {
                    boardMsg.delete().catch(() => null);
                }, 20000);

                if (btnInteraction.customId === 'btn_prev_dnt_board') {
                    if (currentPage > 0) currentPage--;
                } else if (btnInteraction.customId === 'btn_next_dnt_board') {
                    if (currentPage < totalPages - 1) currentPage++;
                }

                const newEmbed = await generateBoardEmbed(currentPage);
                const newButtons = generateButtons(currentPage);

                await btnInteraction.update({
                    embeds: [newEmbed],
                    components: [newButtons]
                }).catch(() => null);
            });
        }
        return;
    }

    // ================= LỆNH QUẢN LÝ DNT / DONATE (CTYDNT) =================
    if (command === 'ctydnt') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        if (args.length === 0) {
            const guildDnt = dntDatabase.get(guildId) || {};
            const userEntries = Object.entries(guildDnt);

            if (userEntries.length === 0) {
                return message.reply('Server hiện tại chưa có dữ liệu đóng góp DNT nào.').catch(() => null);
            }

            userEntries.sort((a, b) => b[1].total - a[1].total);

            let dntListContent = `**DANH SÁCH THÀNH VIÊN ĐÓNG GÓP DNT (DONATE):**\n\n`;
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_dnt_user_history')
                .setPlaceholder('--- Chọn người dùng để xem lịch sử ủng hộ ---');

            for (const [userId, data] of userEntries) {
                const member = await message.guild.members.fetch(userId).catch(() => null);
                const displayName = member ? member.displayName : `User ID: ${userId}`;

                dntListContent += `• **${displayName}**: **${formatCurrency(data.total)} VNĐ** (${data.history.length} lần ủng hộ)\n`;

                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(displayName)
                        .setDescription(`Tổng DNT: ${formatCurrency(data.total)} VNĐ (${data.history.length} lần +)`)
                        .setValue(userId)
                );
            }

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const listMessage = await message.channel.send({
                content: dntListContent + '\n*Chọn tên bên dưới để kiểm tra chi tiết các lần +DNT:*',
                components: [row]
            }).catch(() => null);

            message.delete().catch(() => null);

            if (listMessage) {
                setTimeout(() => {
                    listMessage.delete().catch(() => null);
                }, 10000);
            }
            return;
        }

        const rawTargetId = args[0].replace(/[<@!>]/g, '');
        const targetMember = await message.guild.members.fetch(rawTargetId).catch(() => null);
        if (!targetMember) return message.reply('Vui lòng tag hoặc nhập ID người dùng cần cộng DNT.').catch(() => null);

        const amountInput = args[1];
        if (!amountInput) return message.reply('Vui lòng nhập số tiền cần cộng (Ví dụ: `10k`, `20k`, `100k`, `1m`, `10m`...).').catch(() => null);

        const parsedAmount = parseAmount(amountInput);
        if (!parsedAmount || parsedAmount <= 0) {
            return message.reply('Số tiền nhập vào không hợp lệ. Vui lòng thử lại với định dạng đúng (Ví dụ: `50k`, `100k`, `1m`).').catch(() => null);
        }

        const currentDate = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const uniqueId = Date.now();

        let guildDnt = dntDatabase.get(guildId) || {};
        if (!guildDnt[targetMember.id]) {
            guildDnt[targetMember.id] = {
                total: 0,
                history: []
            };
        }

        guildDnt[targetMember.id].total += parsedAmount;
        guildDnt[targetMember.id].history.push({
            id: uniqueId,
            amount: parsedAmount,
            date: currentDate,
            moderatorId: message.author.id
        });

        dntDatabase.set(guildId, guildDnt);
        saveMapToFile(dntDatabase, DNT_FILE);

        const newTotal = guildDnt[targetMember.id].total;

        return message.reply(
            `**CỘNG DNT THÀNH CÔNG!**\n` +
            `Thành viên: <@${targetMember.id}>\n` +
            `Đã cộng thêm: **+${formatCurrency(parsedAmount)} VNĐ** (\`${amountInput}\`)\n` +
            `**Tổng DNT hiện tại:** **${formatCurrency(newTotal)} VNĐ**`
        ).catch(() => null);
    }

    // ================= LỆNH CẤP QUYỀN / XEM QUẢN LÝ TQUANLY =================
    if (command === 'tquanly') {
        if (!isOwner(message.author)) {
            return message.reply('❌ Bạn không có quyền quản lý danh sách Quản lý!').catch(() => null);
        }

        if (args.length === 0) {
            if (dynamicManagers.length === 0) {
                const emptyMsg = await message.channel.send({ content: `⚠️ Hiện tại chưa có thành viên nào được cấp quyền Quản lý.`, reply: { messageReference: message.id } }).catch(() => null);
                message.delete().catch(() => null);
                setTimeout(() => { if (emptyMsg) emptyMsg.delete().catch(() => null); }, 10000);
                return;
            }
            
            const managerListTags = dynamicManagers.map(id => `<@${id}> (ID: \`${id}\`)`).join('\n');
            const listMsg = await message.channel.send({ content: `💼 **Danh sách Quản lý hiện tại của Bot:**\n${managerListTags}`, reply: { messageReference: message.id } }).catch(() => null);
            message.delete().catch(() => null);
            setTimeout(() => { if (listMsg) listMsg.delete().catch(() => null); }, 10000);
            return;
        }

        const targetUserId = args[0].replace(/[<@!>]/g, '');
        if (!targetUserId || !/^\d{17,19}$/.test(targetUserId)) {
            return message.reply('Vui lòng nhập đúng ID hoặc tag người dùng cần cấp quyền Quản lý (Ví dụ: `tquanly @user` hoặc `tquanly 715825553504075868`).').catch(() => null);
        }

        if (dynamicManagers.includes(targetUserId)) {
            return message.reply('Thành viên này đã có trong danh sách Quản lý rồi.').catch(() => null);
        }

        dynamicManagers.push(targetUserId);
        writeJSON(MANAGERS_FILE, dynamicManagers);

        return message.reply(`✅ Đã cấp quyền Quản lý cho thành viên <@${targetUserId}>! Họ có thể dùng các lệnh: Mute, Ban, Warn, Role (tcreate, tadd, tdelete), Emoji, Sticker, Photo Emoji/Sticker, DNT.`).catch(() => null);
    }

    // ================= LỆNH GỠ QUYỀN QUẢN LÝ TQUANLYOFF =================
    if (command === 'tquanlyoff') {
        if (!isOwner(message.author)) {
            return message.reply('❌ Bạn không có quyền gỡ quyền Quản lý!').catch(() => null);
        }

        const targetUserId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        if (!targetUserId || !/^\d{17,19}$/.test(targetUserId)) {
            return message.reply('Vui lòng nhập đúng ID hoặc tag người dùng cần gỡ quyền Quản lý (Ví dụ: `tquanlyoff @user` hoặc `tquanlyoff 715825553504075868`).').catch(() => null);
        }

        if (!dynamicManagers.includes(targetUserId)) {
            return message.reply('Thành viên này vốn không nằm trong danh sách Quản lý để gỡ.').catch(() => null);
        }

        dynamicManagers = dynamicManagers.filter(id => id !== targetUserId);
        writeJSON(MANAGERS_FILE, dynamicManagers);

        return message.reply(`❌ Đã thu hồi quyền Quản lý từ thành viên <@${targetUserId}>. Họ đã trở về làm user thường!`).catch(() => null);
    }

    // ================= LỆNH CẤP QUYỀN ADMIN ĐỘNG TADMIN =================
    if (command === 'tadmin') {
        if (!isPrimaryOwner(message.author)) {
            return message.reply('❌ **BẢO MẬT:** Chỉ duy nhất Owner chính của Bot (`ID: 715825553504075868`) mới có quyền sử dụng lệnh này!').catch(() => null);
        }

        if (args.length === 0) {
            if (dynamicAdmins.length === 0) {
                const emptyMsg = await message.channel.send({ content: `⚠️ Hiện tại chưa có thành viên nào được cấp quyền admin động của Bot qua lệnh.`, reply: { messageReference: message.id } }).catch(() => null);
                message.delete().catch(() => null);

                setTimeout(() => {
                    if (emptyMsg) emptyMsg.delete().catch(() => null);
                }, 10000);
                return;
            }
            
            const adminListTags = dynamicAdmins.map(id => `<@${id}> (ID: \`${id}\`)`).join('\n');
            const listMsg = await message.channel.send({ content: `👑 **Danh sách Admin động hiện tại của Bot:**\n${adminListTags}`, reply: { messageReference: message.id } }).catch(() => null);
            message.delete().catch(() => null);
            
            setTimeout(() => {
                if (listMsg) listMsg.delete().catch(() => null);
            }, 10000);
            return;
        }

        const targetUserId = args[0].replace(/[<@!>]/g, '');
        if (!targetUserId || !/^\d{17,19}$/.test(targetUserId)) {
            return message.reply('Vui lòng nhập đúng ID hoặc tag người dùng cần cấp quyền Admin (Ví dụ: `tadmin @user` hoặc `tadmin 715825553504075868`).').catch(() => null);
        }

        if (dynamicAdmins.includes(targetUserId)) {
            return message.reply('Thành viên này hiện đã có trong danh sách quản trị viên của bot rồi.').catch(() => null);
        }

        dynamicAdmins.push(targetUserId);
        writeJSON(ADMINS_FILE, dynamicAdmins);

        return message.reply(`✅ Đã cấp toàn quyền sử dụng lệnh và menu của Bot thành công cho thành viên <@${targetUserId}>!`).catch(() => null);
    }

    // ================= LỆNH GỠ QUYỀN ADMIN ĐỘNG TADMINOFF =================
    if (command === 'tadminoff') {
        if (!isPrimaryOwner(message.author)) {
            return message.reply('❌ **BẢO MẬT:** Chỉ duy nhất Owner chính của Bot (`ID: 715825553504075868`) mới có quyền sử dụng lệnh này!').catch(() => null);
        }

        const targetUserId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        if (!targetUserId || !/^\d{17,19}$/.test(targetUserId)) {
            return message.reply('Vui lòng nhập đúng ID hoặc tag người dùng cần gỡ quyền Admin (Ví dụ: `tadminoff @user` hoặc `tadminoff 715825553504075868`).').catch(() => null);
        }

        if (!dynamicAdmins.includes(targetUserId)) {
            return message.reply('Thành viên này hiện vốn không nằm trong danh sách admin động của bot để gỡ.').catch(() => null);
        }

        dynamicAdmins = dynamicAdmins.filter(id => id !== targetUserId);
        writeJSON(ADMINS_FILE, dynamicAdmins);

        return message.reply(`❌ Đã thu hồi toàn bộ quyền sử dụng Bot thành công từ thành viên <@${targetUserId}>. Họ đã trở về làm user thường!`).catch(() => null);
    }

    // ================= LỆNH HƯỚNG DẪN TRA CỨU TMENU =================
    if (command === 'tmenu') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_bot_menu_category')
            .setPlaceholder('--- Chọn cụm tính năng bạn muốn xem hướng dẫn ---')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('🛠️ Cụm lệnh Quản lý Vai trò (Roles)')
                    .setDescription('Xem tcreate, troleon, troleoff, tadd, tdelete...')
                    .setValue('menu_roles'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('⚠️ Cụm lệnh Cảnh cáo (Warns)')
                    .setDescription('Xem cách dùng lệnh twarn, tunwarn và DB lưu trữ...')
                    .setValue('menu_warns'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('💜 Cụm lệnh Hệ thống Nitro Boost & VIP & DNT & Rank')
                    .setDescription('Xem tlist, ctysetrank, ctyrank, ctytop, ctyresetrank...')
                    .setValue('menu_boost'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🛡️ Cụm lệnh Quản trị Server (Moderation & Admin)')
                    .setDescription('Xem cách dùng tadmin, tadminoff, tquanly, /tsay, tkick, tban...')
                    .setValue('menu_mods'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('🔮 Các lệnh Tiện ích & Nhân bản khác')
                    .setDescription('Xem cách dùng lệnh em ea em, temoji, tsticker, tphotoemj...')
                    .setValue('menu_utilities')
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        const mainHelpEmbed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle('📖 TRUNG TÂM TRA CỨU LỆNH BOT')
            .setDescription('Vui lòng chọn cụm tính năng trong menu bên dưới để xem tài liệu hướng dẫn chi tiết.')
            .setImage(DIVIDER_BANNER);

        await message.channel.send({
            embeds: [mainHelpEmbed],
            components: [row],
            reply: { messageReference: message.id }
        }).catch(() => null);

        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH BẢNG THÔNG TIN GỘP VIP 1, 2, 3 =================
    if (command === 'tvipinfo' || command === 'tvip123info') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const vipComboEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('👑 DNT SERVER - CẤP BẬC VIP 1, 2 & 3 👑')
            .setDescription(
                '### 📌 **VIP 1:**\n' +
                '• **Điều kiện:** Donate tối thiểu **50,000 VNĐ**\n' +
                '⭐ Nhận role **`@VIP 1`**\n\n' +
                '--- \n\n' +
                '### 📌 **VIP 2:**\n' +
                '• **Điều kiện:** Donate tối thiểu **100,000 VNĐ**\n' +
                '⭐ Nhận role **`@VIP 2`**\n\n' +
                '--- \n\n' +
                '### 📌 **VIP 3:**\n' +
                '• **Điều kiện:** Donate tối thiểu **150,000 VNĐ**\n' +
                '⭐ Nhận role **`@VIP 3`**\n\n' +
                '💡 *Lưu ý: Quyền hạn của 3 cấp bậc VIP 1, VIP 2, VIP 3 là ngang nhau.*'
            )
            .setImage(DIVIDER_BANNER)
            .setTimestamp();

        await message.channel.send({ embeds: [vipComboEmbed] }).catch(() => null);
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH BẢNG THÔNG TIN GỘP VIP 4, 5, 6, 7 =================
    if (command === 'tvipinfo2' || command === 'tvip4567info') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const vipGroup2Embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('👑 DNT SERVER - CẤP BẬC VIP 4, 5, 6 & 7 👑')
            .setDescription(
                '### 📌 **VIP 4:**\n' +
                '• **Điều kiện:** Donate tối thiểu **300,000 VNĐ**\n' +
                '⭐ Nhận role **`@VIP 4`**\n' +
                '⭐ Được phép **tạo 1 role riêng** tùy chỉnh\n' +
                '⭐ Được quyền **chat trong lúc lockchat**\n\n' +
                '--- \n\n' +
                '### 📌 **VIP 5:**\n' +
                '• **Điều kiện:** Donate tối thiểu **500,000 VNĐ**\n' +
                '✓ **Bao gồm tất cả các quyền của VIP 4 + thêm:**\n' +
                '⭐ Nhận role **`@VIP 5`**\n' +
                '⭐ Được quyền **Tắt mic (Mute Mic)** người khác trong kênh Voice\n\n' +
                '--- \n\n' +
                '### 📌 **VIP 6:**\n' +
                '• **Điều kiện:** Donate tối thiểu **800,000 VNĐ**\n' +
                '✓ **Bao gồm tất cả các quyền của VIP 5 + thêm:**\n' +
                '⭐ Nhận role **`@VIP 6`**\n' +
                '⭐ Được quyền **Tắt loa (Mute Loa/Deafen)** người khác trong kênh Voice\n\n' +
                '--- \n\n' +
                '### 📌 **VIP 7:**\n' +
                '• **Điều kiện:** Donate tối thiểu **1,000,000 VNĐ**\n' +
                '✓ **Bao gồm tất cả các quyền của VIP 6 + thêm:**\n' +
                '⭐ Nhận role **`@VIP 7`**\n' +
                '⭐ Được quyền **Di chuyển (Move)** thành viên giữa các room voice'
            )
            .setImage(DIVIDER_BANNER)
            .setTimestamp();

        await message.channel.send({ embeds: [vipGroup2Embed] }).catch(() => null);
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH BẢNG THÔNG TIN VIP 8 =================
    if (command === 'tvip8info') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const vip8Embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('👑 VIP 8 - @VIP 8 👑')
            .setDescription(
                '### • *(Donate tối thiểu 2,000,000 VNĐ)*\n\n' +
                '### ❇️ **Quyền hạn chi tiết:**\n' +
                '✓ **Bao gồm tất cả các quyền của VIP 7 + thêm:**\n' +
                '⭐ Nhận role **`@VIP 8`**\n' +
                '⭐ Được quyền **Ngắt kết nối (Disconnect)** người khác ra khỏi room\n' +
                '⭐ Được truy cập/vào kênh Giveaway riêng của DNT Server\n' +
                '⭐ Được quyền gán/thêm role (add role)'
            )
            .setImage(DIVIDER_BANNER)
            .setTimestamp();

        await message.channel.send({ embeds: [vip8Embed] }).catch(() => null);
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH BẢNG THÔNG TIN VIP 9 =================
    if (command === 'tvip9info') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const vip9Embed = new EmbedBuilder()
            .setColor('#34495E')
            .setTitle('👑 VIP 9 - @VIP 9 👑')
            .setDescription(
                '### • *(Donate tối thiểu 3,000,000 VNĐ)*\n\n' +
                '### ❇️ **Quyền hạn chi tiết:**\n' +
                '✓ **Bao gồm tất cả các quyền của VIP 8 + thêm:**\n' +
                '⭐ Nhận role **`@VIP 9`**\n' +
                '⭐ Được quyền Mute người dùng'
            )
            .setImage(DIVIDER_BANNER)
            .setTimestamp();

        await message.channel.send({ embeds: [vip9Embed] }).catch(() => null);
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH BẢNG THÔNG TIN VIP 10 =================
    if (command === 'tvip10info') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const vip10Embed = new EmbedBuilder()
            .setColor('#D35400')
            .setTitle('🔥 VIP 10 - @VIP 10 🔥')
            .setDescription(
                '### • *(Donate tối thiểu 5,000,000 VNĐ)*\n\n' +
                '### ❇️ **Quyền hạn chi tiết:**\n' +
                '✓ **Bao gồm tất cả các quyền của VIP 9 + thêm:**\n' +
                '⭐ Nhận role **`@VIP 10`**\n' +
                '⭐ Được quyền Ban người dùng\n' +
                '⭐ Được quyền gán/thêm/quản lý role'
            )
            .setImage(DIVIDER_BANNER)
            .setTimestamp();

        await message.channel.send({ embeds: [vip10Embed] }).catch(() => null);
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH BẢNG THÔNG TIN NITRO BOOST =================
    if (command === 'tboostinfo') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const boostEmbed = new EmbedBuilder()
            .setColor('#F47FFF')
            .setTitle('✨ BOOSTER SERVER - @Nhà Đầu Tư ✨')
            .setDescription(
                '### • *(Đặc quyền dành riêng cho các thành viên Boost Server)*\n\n' +
                '### ❇️ **Quyền hạn chi tiết:**\n' +
                '⭐ Được phép **tạo Custom Role** riêng tùy chỉnh (Tên, màu sắc & biểu tượng theo ý thích).\n' +
                '⭐ Được phép **tạo Custom Room (Voice/Chat VIP)** riêng dành cho bản thân và bạn bè.\n' +
                '⭐ Có quyền truy cập các kênh / đặc quyền ưu tiên của Booster.\n\n' +
                '### ⚠️ **Lưu ý:**\n' +
                'Khi hết thời hạn Boost Server, toàn bộ **Custom Role** và **Custom Room** đã tạo sẽ tự động bị thu hồi.'
            )
            .setImage(DIVIDER_BANNER)
            .setTimestamp();

        await message.channel.send({ embeds: [boostEmbed] }).catch(() => null);
        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH TRAO ROLE RÚT GỌN =================
    if (command === 'tadd') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('Tớ không có quyền `Quản lý vai trò` để thực hiện thao tác.').catch(() => null);
        }

        const rawTargetId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const targetMember = await message.guild.members.fetch(rawTargetId).catch(() => null);
        if (!targetMember) return message.reply('Vui lòng tag người dùng hoặc nhập ID người dùng hợp lệ.').catch(() => null);

        const roleQuery = args.slice(1).join(' ');
        if (!roleQuery) return message.reply('Vui lòng nhập tên role hoặc ID role cần cấp.').catch(() => null);

        const role = message.guild.roles.cache.get(roleQuery) || message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase());
        if (!role) return message.reply(`Không tìm thấy vai trò nào ứng với thông tin \`${roleQuery}\`.`).catch(() => null);

        try {
            if (targetMember.roles.cache.has(role.id)) return message.reply('Người này đã có vai trò này rồi.').catch(() => null);
            await targetMember.roles.add(role);
            return message.reply(`Đã cấp vai trò **${role.name}** thành công cho thành viên **${targetMember.user.tag}**!`).catch(() => null);
        } catch (error) {
            return message.reply('Không thể cấp vai trò này. Có thể vai trò này cao hơn cấp bậc vai trò của bot.').catch(() => null);
        }
    }

    // ================= LỆNH GỠ ROLE RÚT GỌN =================
    if (command === 'tdelete') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('Tớ không có quyền `Quản lý vai trò` để thực hiện thao tác.').catch(() => null);
        }

        const rawTargetId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const targetMember = await message.guild.members.fetch(rawTargetId).catch(() => null);
        if (!targetMember) return message.reply('Vui lòng tag người dùng hoặc nhập ID người dùng hợp lệ.').catch(() => null);

        const roleQuery = args.slice(1).join(' ');
        if (!roleQuery) return message.reply('Vui lòng nhập tên role hoặc ID role cần xóa.').catch(() => null);

        const role = message.guild.roles.cache.get(roleQuery) || message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase());
        if (!role) return message.reply(`Không tìm thấy vai trò nào ứng với thông tin \`${roleQuery}\`.`).catch(() => null);

        try {
            if (!targetMember.roles.cache.has(role.id)) return message.reply('Người này chưa có vai trò này để xóa.').catch(() => null);
            await targetMember.roles.remove(role);
            return message.reply(`Đã thu hồi vai trò **${role.name}** thành công từ thành viên **${targetMember.user.tag}**!`).catch(() => null);
        } catch (error) {
            return message.reply('Không thể xóa vai trò này. Có thể vai trò này cao hơn cấp bậc vai trò của bot.').catch(() => null);
        }
    }

    // ================= LỆNH TBOOSTON VÀ TBOOSTOFF =================
    if (command === 'tbooston') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const targetChannelId = args[0] ? args[0].replace(/[<#>]/g, '') : null;
        if (!targetChannelId) return message.reply('Vui lòng nhập đúng ID kênh hoặc tag kênh (Ví dụ: `tbooston #channel-name` hoặc `tbooston 1525459821459931239`).').catch(() => null);

        const checkChannel = message.guild.channels.cache.get(targetChannelId);
        if (!checkChannel) return message.reply('Tớ không tìm thấy kênh này trong server. Vui lòng kiểm tra lại ID.').catch(() => null);

        boostChannelsDatabase.set(guildId, targetChannelId);
        saveMapToFile(boostChannelsDatabase, BOOST_FILE);

        return message.reply(`✅ Đã bật hệ thống cảm ơn Nitro Boost thành công! Chúng tôi sẽ gửi lời cảm ơn đến những người đã boost server tại kênh <#${targetChannelId}>.`).catch(() => null);
    }

    if (command === 'tboostoff') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        if (!boostChannelsDatabase.has(guildId)) {
            return message.reply('Hệ thống cảm ơn Nitro Boost hiện tại vốn đang tắt sẵn trên server này rồi.').catch(() => null);
        }
        boostChannelsDatabase.delete(guildId);
        saveMapToFile(boostChannelsDatabase, BOOST_FILE);

        return message.reply('❌ Đã tắt hệ thống cảm ơn Nitro Boost. Chúng tôi sẽ không gửi tin nhắn cảm ơn tại kênh cũ nữa, sẵn sàng đợi bạn chuyển qua cấu hình kênh mới bằng lệnh `tbooston`.').catch(() => null);
    }

    // ================= LỆNH TẠO ROLE ĐẶC BIỆT TCREATE =================
    if (message.content.trim().toLowerCase().startsWith('tcreate')) {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('Tớ không có quyền `Quản lý vai trò` để thực hiện tạo role mới.').catch(() => null);
        }

        const argsCreate = message.content.trim().split(/ +/);
        argsCreate.shift(); 

        if (argsCreate.length < 2) {
            return message.reply('Vui lòng nhập đúng công thức: `tcreate <Tên_Role> <ID hoặc @tag> <Màu_Hex_1> [Màu_Hex_2] [Emoji]` (Có thể đính kèm hoặc reply ảnh/sticker/emoji)').catch(() => null);
        }

        const colorRegex = /^#?[0-9a-fA-F]{6}$/;
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])|<a?:[a-zA-Z0-9_]+:(\d+)>/;
        const userOrIdRegex = /^<@!?(\d{17,19})>$|^\d{17,19}$/; 

        let roleName = '';
        let targetUserId = null;
        let color1 = null;
        let color2 = null;
        let roleIcon = null;
        let externalImageBuffer = null;

        if (argsCreate.length > 0 && emojiRegex.test(argsCreate[argsCreate.length - 1])) {
            roleIcon = argsCreate.pop();
        }

        if (argsCreate.length >= 2 && colorRegex.test(argsCreate[argsCreate.length - 1]) && colorRegex.test(argsCreate[argsCreate.length - 2])) {
            color2 = argsCreate.pop();
            color1 = argsCreate.pop();
        } else if (argsCreate.length >= 1 && colorRegex.test(argsCreate[argsCreate.length - 1])) {
            color1 = argsCreate.pop();
        }

        const possibleUser = argsCreate[argsCreate.length - 1];
        if (argsCreate.length >= 1 && userOrIdRegex.test(possibleUser)) {
            const rawUser = argsCreate.pop();
            const match = rawUser.match(/\d+/);
            if (match) targetUserId = match[0];
        }

        roleName = argsCreate.join(' ');

        if (!roleName) return message.reply('Vui lòng nhập tên cho vai trò.').catch(() => null);
        if (!targetUserId) return message.reply('Vui lòng nhập đúng ID hoặc @tag người dùng (chủ role).').catch(() => null);
        if (!color1) return message.reply('Vui lòng nhập ít nhất một mã màu Hex chuẩn (Ví dụ: #ff0000).').catch(() => null);

        let mediaUrl = null;
        if (message.attachments.size > 0) {
            const att = message.attachments.first();
            if (att.contentType && att.contentType.startsWith('image/')) mediaUrl = att.url;
        }

        if (!mediaUrl && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.attachments.size > 0) {
                    const att = repliedMessage.attachments.first();
                    if (att.contentType && att.contentType.startsWith('image/')) mediaUrl = att.url;
                } else if (repliedMessage.stickers.size > 0) {
                    mediaUrl = `https://media.discordapp.net/stickers/${repliedMessage.stickers.first().id}.png`;
                } else {
                    const emjMatch = repliedMessage.content.match(/<a?:[a-zA-Z0-9_]+:(\d+)>/);
                    if (emjMatch) {
                        const isAnim = emjMatch[0].startsWith('<a:');
                        mediaUrl = `https://cdn.discordapp.com/emojis/${emjMatch[1]}.${isAnim ? 'gif' : 'png'}`;
                    }
                }
            } catch (err) {}
        }

        if (mediaUrl) {
            try {
                const res = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
                externalImageBuffer = await sharp(Buffer.from(res.data))
                    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();
            } catch (imgErr) {}
        }

        try {
            const targetMember = await message.guild.members.fetch(targetUserId).catch(() => null);
            if (!targetMember) return message.reply('Không tìm thấy thành viên này trong server.').catch(() => null);

            const finalColor = color2 ? blendHexColors(color1, color2) : color1;

            const newRole = await message.guild.roles.create({
                name: roleName,
                color: finalColor,
                permissions: [],
                reason: `Được tạo tự động bởi lệnh từ ${message.author.tag}`
            });

            const anchorRoleId = roleAnchorDatabase.get(guildId);
            if (anchorRoleId) {
                const anchorRole = message.guild.roles.cache.get(anchorRoleId);
                if (anchorRole) {
                    try {
                        await newRole.setPosition(anchorRole.position);
                    } catch (posError) {
                        console.log("Không thể kéo role lên trên mốc chỉ định do vị trí Role của Bot thấp hơn.");
                    }
                }
            }

            let iconInjectedSuccess = false;

            if (externalImageBuffer) {
                try {
                    await newRole.edit({ icon: externalImageBuffer });
                    iconInjectedSuccess = true;
                } catch (iconError) {
                    console.log("Không thể gán Icon cho role này (Do server chưa đạt đủ Boost Level 2).");
                }
            } else if (roleIcon) {
                const roleDataWithIcon = {};
                const customEmojiMatch = roleIcon.match(/<a?:[a-zA-Z0-9_]+:(\d+)>/);
                
                if (customEmojiMatch) {
                    roleDataWithIcon.icon = `https://cdn.discordapp.com/emojis/${customEmojiMatch[1]}.png`;
                } else {
                    roleDataWithIcon.unicodeEmoji = roleIcon;
                }

                try {
                    await newRole.edit(roleDataWithIcon);
                    iconInjectedSuccess = true;
                } catch (iconError) {
                    console.log("Không thể gán Icon cho role này (Do server chưa đạt đủ Boost Level 2).");
                }
            }

            await targetMember.roles.add(newRole);

            let responseMsg = `Đã tạo vai trò an toàn **${newRole.name}** và cấp thẳng cho thành viên <@${targetUserId}> thành công!`;
            responseMsg += `\n- Màu áp dụng: \`${finalColor}\``;
            if (color2) {
                responseMsg += `\n- *Lưu ý:* Bot đã tự động phối trộn màu trung gian tối ưu giữa dải màu \`${color1}\` và \`${color2}\`. Bạn có thể vào Cài đặt vai trò tích chọn mục **Chuyển Màu** để hiển thị đa sắc hoàn hảo nhất!`;
            }
            if (externalImageBuffer || roleIcon) {
                if (iconInjectedSuccess) {
                    responseMsg += `\n- Biểu tượng (Icon): ${roleIcon || 'Đã áp dụng từ ảnh/sticker'}`;
                } else {
                    responseMsg += `\n- *Lưu ý về Biểu tượng:* Hệ thống Discord bắt buộc server phải đạt **Boost Cấp 2** mới cho phép cài biểu tượng vai trò, nên bot tạm thời bỏ qua icon và giữ lại màu sắc chuẩn cho bạn nhé!`;
                }
            }

            return message.reply(responseMsg).catch(() => null);
        } catch (error) {
            console.error('Lỗi tcreate:', error);
            return message.reply('Không thể hoàn tất tạo vai trò. Hãy chắc chắn phân cấp của Bot đủ cao.').catch(() => null);
        }
    }

    // ================= KHU VỰC TRÒ CHUYỆN: KHÔNG CẦN QUYỀN ADMIN =================
    if (message.content.trim().toLowerCase() === 'em à em') {
        const replies = ['nghe', 'há', 'hả', 'cái gì'];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        return message.reply(randomReply).catch(() => null);
    }

    // LỆNH TWARN HỆ THỐNG MENU 
    if (command === 'twarn') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        if (args.length === 0) {
            const guildWarns = warnsDatabase.get(guildId) || [];
            if (guildWarns.length === 0) return message.reply('Server hiện tại chưa có thành viên nào bị cảnh cáo.').catch(() => null);

            const uniqueUsers = [...new Set(guildWarns.map(w => w.userId))];
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_warned_user')
                .setPlaceholder('--- Chọn người muốn xem lịch sử phạt ---');

            for (const userId of uniqueUsers) {
                const member = await message.guild.members.fetch(userId).catch(() => null);
                const displayName = member ? member.user.tag : `User ID: ${userId}`;
                const totalWarns = guildWarns.filter(w => w.userId === userId).length;

                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(displayName)
                        .setDescription(`Tổng số lần phạt: ${totalWarns} lần`)
                        .setValue(userId)
                );
            }

            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            await message.channel.send({
                content: '📁 **Hệ thống Quản lý Phạt**: Hãy chọn thành viên bên dưới để xem chi tiết ngày và lý do:',
                components: [row],
                reply: { messageReference: message.id }
            }).catch(() => null);

            message.delete().catch(() => null);
            return;
        }

        const rawTargetId = args[0].replace(/[<@!>]/g, '');
        const targetMember = await message.guild.members.fetch(rawTargetId).catch(() => null);
        if (!targetMember) return message.reply('Vui lòng tag hoặc nhập ID của người cần cảnh cáo.').catch(() => null);

        const reason = args.slice(1).join(' ') || 'Không có lý do';
        const currentDate = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const uniqueWarnId = Date.now();

        if (!warnsDatabase.has(guildId)) warnsDatabase.set(guildId, []);
        warnsDatabase.get(guildId).push({
            id: uniqueWarnId,
            userId: targetMember.id,
            reason: reason,
            date: currentDate,
            moderatorId: message.author.id
        });

        saveMapToFile(warnsDatabase, WARNS_FILE);

        const totalWarnsCount = warnsDatabase.get(guildId).filter(w => w.userId === targetMember.id).length;

        try {
            let dmMessage = `⚠️ **Thông báo Cảnh cáo từ server ${message.guild.name}** ⚠️\n`;
            dmMessage += `Bạn vừa nhận 1 cảnh cáo từ Ban Quản Trị.\n`;
            dmMessage += `- **Tổng số lần bị cảnh cáo hiện tại:** \`${totalWarnsCount} lần\`\n`;
            dmMessage += `- **Ngày giờ phạt:** *${currentDate}*\n`;
            dmMessage += `- **Lý do phạt:** \`${reason}\``;
            
            await targetMember.send(dmMessage);
        } catch (dmError) {
            console.log(`Không thể gửi tin nhắn DM cho ${targetMember.user.tag}`);
        }

        return message.reply('⚠️ Đã cảnh cáo thành viên ' + `<@${targetMember.id}> thành công và gửi thông báo về DM! Lý do: \`${reason}\``).catch(() => null);
    }

    // LỆNH TUNWARN GỠ BỎ LỖI PHẠT QUA MENU THẢ XUỐNG
    if (command === 'tunwarn') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const guildWarns = warnsDatabase.get(guildId) || [];

        if (guildWarns.length === 0) {
            return message.reply('Server hiện tại không có ai có lịch sử cảnh cáo để bạn tiến hành gỡ bỏ.').catch(() => null);
        }

        const uniqueUsers = [...new Set(guildWarns.map(w => w.userId))];
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('unwarn_select_user')
            .setPlaceholder('--- Chọn thành viên bạn muốn gỡ lỗi phạt ---');

        for (const userId of uniqueUsers) {
            const member = await message.guild.members.fetch(userId).catch(() => null);
            const displayName = member ? member.user.tag : `User ID: ${userId}`;
            const count = guildWarns.filter(w => w.userId === userId).length;

            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(displayName)
                    .setDescription(`Đang có: ${count} lỗi cảnh cáo`)
                    .setValue(userId)
            );
        }

        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        await message.channel.send({
            content: '🛠️ **Hệ thống Gỡ Cảnh Cáo**: Vui lòng chọn thành viên bạn muốn bắt đầu xử lý gỡ lỗi phạt:',
            components: [row],
            reply: { messageReference: message.id }
        }).catch(() => null);

        message.delete().catch(() => null);
        return;
    }

    // ================= LỆNH QUẢN LÝ EMOJI, STICKER & PHOTO EMOJI/STICKER =================
    if (command === 'temoji') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            const emojiRegex = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;
            const matches = [...repliedMessage.content.matchAll(emojiRegex)];
            if (matches.length === 0) return message.reply('Tin nhắn bạn phản hồi không chứa emoji tùy chỉnh nào.').catch(() => null);
            const emojiName = args[0] || matches[0][1];
            const emojiId = matches[0][2];
            const isAnimated = matches[0][0].startsWith('<a:');
            const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? 'gif' : 'png'}`;
            const createdEmoji = await message.guild.emojis.create({ attachment: emojiUrl, name: emojiName });
            return message.reply(`Đã thêm thành công emoji mới: ${createdEmoji} với tên \`${emojiName}\``).catch(() => null);
        } catch (error) { return message.reply('Không thể thêm emoji này.').catch(() => null); }
    }

    if (command === 'tsticker') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            const sticker = repliedMessage.stickers.first();
            if (!sticker) return message.reply('Tin nhắn bạn phản hồi không có sticker nào.').catch(() => null);
            const customStickerName = args[0] || sticker.name;
            const stickerUrl = `https://media.discordapp.net/stickers/${sticker.id}.png`;
            try {
                const createdSticker = await message.guild.stickers.create({ 
                    file: stickerUrl, 
                    name: customStickerName, 
                    tags: '✨', 
                    description: `Cloned by ${message.author.username}` 
                });
                return message.reply(`Đã nhân bản thành công sticker \`${customStickerName}\` vào server!`).catch(() => null);
            } catch (createError) { return message.reply(`Server hiện tại không đủ cấp độ Boost để tạo Sticker trực tiếp. Link gốc:\n${stickerUrl}`).catch(() => null); }
        } catch (error) { return message.reply('Có lỗi xảy ra khi xử lý sticker.').catch(() => null); }
    }

    if (command === 'tphotoemj') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        let imageUrl = null;
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                imageUrl = attachment.url;
            }
        }

        if (!imageUrl && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.attachments.size > 0) {
                    const attachment = repliedMessage.attachments.first();
                    if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                        imageUrl = attachment.url;
                    }
                }
            } catch (err) {}
        }

        if (!imageUrl) {
            return message.reply('Vui lòng đính kèm ảnh trực tiếp hoặc reply vào tin nhắn chứa ảnh cần làm Emoji.').catch(() => null);
        }

        const emojiName = args[0] || `photo_emoji_${Date.now().toString().slice(-4)}`;
        const cleanEmojiName = emojiName.replace(/[^a-zA-Z0-9_]/g, '_');

        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const resizedBuffer = await sharp(Buffer.from(response.data))
                .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            const createdEmoji = await message.guild.emojis.create({ attachment: resizedBuffer, name: cleanEmojiName });
            return message.reply(`✅ Đã biến ảnh thành Emoji thành công: ${createdEmoji} với tên \`${createdEmoji.name}\`!`).catch(() => null);
        } catch (error) {
            console.error(error);
            return message.reply('❌ Không thể tạo Emoji từ ảnh này. Vui lòng kiểm tra lại số lượng slot Emoji của server.').catch(() => null);
        }
    }

    if (command === 'tphotostk') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        let imageUrl = null;
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                imageUrl = attachment.url;
            }
        }

        if (!imageUrl && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.attachments.size > 0) {
                    const attachment = repliedMessage.attachments.first();
                    if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                        imageUrl = attachment.url;
                    }
                }
            } catch (err) {}
        }

        if (!imageUrl) {
            return message.reply('Vui lòng đính kèm ảnh trực tiếp hoặc reply vào tin nhắn chứa ảnh cần làm Sticker.').catch(() => null);
        }

        const stickerName = args[0] || `Photo_Sticker_${Date.now().toString().slice(-4)}`;

        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const png320Buffer = await sharp(Buffer.from(response.data))
                .resize(320, 320, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            const createdSticker = await message.guild.stickers.create({ 
                file: png320Buffer, 
                name: stickerName, 
                tags: '✨', 
                description: `Created by ${message.author.username}` 
            });
            return message.reply(`✅ Đã biến ảnh thành Sticker thành công với tên \`${createdSticker.name}\`!`).catch(() => null);
        } catch (error) {
            console.error('Lỗi chi tiết tạo Sticker:', error);
            return message.reply('❌ Không thể tạo Sticker từ ảnh này. Đảm bảo server còn slot Sticker trống và phân cấp Bot đủ quyền.').catch(() => null);
        }
    }

    // ================= LỆNH MODERATION (KICK, BAN, MUTE) =================
    if (command === 'tkick') {
        if (!isOwner(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const rawTargetId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const target = await message.guild.members.fetch(rawTargetId).catch(() => null);
        if (!target) return message.reply('Tag hoặc nhập ID người cần kick.').catch(() => null);
        if (!target.kickable) return message.reply('Không đủ quyền hạn để kick (Role của họ cao hơn Bot).').catch(() => null);
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        await target.kick(reason);
        return message.reply(`Đã đá bay màu ${target.user.tag} thành công. Lý do: ${reason}`).catch(() => null);
    }

    if (command === 'tban') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const rawTargetId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const target = await message.guild.members.fetch(rawTargetId).catch(() => null);
        if (!target) return message.reply('Phải tag hoặc nhập ID người cần ban.').catch(() => null);
        if (!target.bannable) return message.reply('Không đủ quyền hạn để ban (Role của họ cao hơn Bot).').catch(() => null);
        const reason = args.slice(1).join(' ') || 'Không có lý do';
        await target.ban({ reason });
        return message.reply(`Đã cấm vĩnh viễn ${target.user.tag}. Lý do: ${reason}`).catch(() => null);
    }

    if (command === 'tunban') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const userId = args[0];
        if (!userId) return message.reply('Vui lòng nhập ID của người cần gỡ cấm.').catch(() => null);
        try {
            await message.guild.members.unban(userId);
            return message.reply(`Đã gỡ cấm thành công cho ID: ${userId}`).catch(() => null);
        } catch (error) { return message.reply('Không tìm thấy lệnh cấm hoặc ID không hợp lệ.').catch(() => null); }
    }

    if (command === 'tmute') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const rawTargetId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const target = await message.guild.members.fetch(rawTargetId).catch(() => null);
        if (!target) return message.reply('Tag hoặc nhập ID người cần Mute.').catch(() => null);
        const timeInput = args[1];
        if (!timeInput) return message.reply('Nhập thời gian kèm đơn vị (s, m, h, d, mo, y).').catch(() => null);
        const timeMatch = timeInput.match(/^(\d+)([a-z]+)$/i);
        if (!timeMatch) return message.reply('Định dạng thời gian không hợp lệ.').catch(() => null);
        const value = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        let durationMs = 0;
        if (unit === 's') durationMs = value * 1000;
        else if (unit === 'm') durationMs = value * 60 * 1000;
        else if (unit === 'h') durationMs = value * 60 * 60 * 1000;
        else if (unit === 'd') durationMs = value * 24 * 60 * 60 * 1000;
        else if (unit === 'mo') durationMs = value * 30 * 24 * 60 * 60 * 1000;
        else if (unit === 'y') durationMs = value * 365 * 24 * 60 * 60 * 1000;
        else return message.reply('Đơn vị thời gian không hợp lệ.').catch(() => null);
        if (durationMs > 28 * 24 * 60 * 60 * 1000) return message.reply('Discord chỉ cho phép mute tối đa 28 ngày.').catch(() => null);
        const reason = args.slice(2).join(' ') || 'Không có lý do';
        try {
            await target.timeout(durationMs, reason);
            return message.reply(`Đã khóa mõm <@${target.id}> trong ${timeInput}. Lý do: ${reason}`).catch(() => null);
        } catch (error) { return message.reply('Không thể mute, quyền thấp hơn họ hoặc Bot thiếu quyền.').catch(() => null); }
    }

    if (command === 'tunmute') {
        if (!isManager(message.author)) return message.reply('Bạn không có quyền sử dụng lệnh quản trị này.').catch(() => null);

        const target = message.mentions.members.first();
        if (!target) return message.reply('Tag người cần unmute.').catch(() => null);
        try {
            await target.timeout(null);
            return message.reply(`Đã mở khóa mõm cho <@${target.id}>.`).catch(() => null);
        } catch (error) { return message.reply('Không thể unmute người này.').catch(() => null); }
    }
});

// ================= TỰ ĐỘNG CHÀO THÀNH VIÊN MỚI =================
client.on(Events.GuildMemberAdd, (member) => {
    const channelId = '1525459821459931239'; 
    const welcomeChannel = member.guild.channels.cache.get(channelId);
    
    const genzGreetings = [
        `Hế lô <@${member.id}>! Sự xuất hiện của bạn làm cả server sáng bừng luôn á. Chúc bạn một ngày mới thật chill và không bị overthinking nhé!`,
        `Gét gô! <@${member.id}> vừa hạ cánh an toàn xuống server. Chúc bạn có những giây phút tám chuyện hết nước chấm!`,
        `Ui trùi ui, <@${member.id}> đã cập bến! Chúc bạn ngày mới luôn tràn đầy năng lượng tích cực và slay hết mình nha.`,
        `Chào đồng chí <@${member.id}>! Vào server rồi thì bung xõa hết nấc thôi, chúc bạn ngày mới thật mượt mà keo lỳ!`,
        `Chào mừng <@${member.id}> gia nhập hội quẩy server! Chúc bạn luôn vui vẻ, nhiều may mắn và không dính drama nhé.`,
        `Ủa ai đây ta? Thì ra là siêu sao <@${member.id}> mới vào! Chúc bạn ngày mới thật suôn sẻ và gặp nhiều điều tuyệt vời.`,
        `Gửi đến <@${member.id}> ngàn lời chào ấm áp! Chúc bạn một ngày mới thật cuốn, học tập và làm việc thật cháy nha.`,
        `Hế lô bạn <@${member.id}>! Đã cùng chung một vibe rồi thì cùng nhau tạo thật nhiều kỷ niệm đẹp tại server nhé!`,
        `Cứu tinh của server <@${member.id}> đây rồi! Chúc bạn một ngày mới vạn sự hanh thông, làm gì cũng trót lọt.`,
        `Chính thức chốt đơn thành viên xịn sò <@${member.id}>! Vào đây tám chuyện xuyên màn đêm cùng tụi mình nha.`,
        `Hello <@${member.id}>! Server lại có thêm một nhân tố chất lượng rồi. Chúc bạn một ngày mới rực rỡ và ngập tràn niềm vui!`,
        `Chào <@${member.id}> nhá! Vào đây rồi thì cứ tự nhiên như ở nhà, chúc bạn có những phút giây thư giãn cực đã.`,
        `Gương mặt vàng trong làng chọn server gọi tên <@${member.id}>! Chúc bạn một ngày mới luôn mỉm cười và may mắn.`,
        `Ngoan xinh yêu <@${member.id}> đã xuất hiện! Chúc bạn ngày mới luôn tươi tắn, tâm trạng phơi phới không lo âu nha.`,
        `Hế lô <@${member.id}>! Trái đất này là của chúng mình, vào server cùng nhau quẩy nhiệt tình và cháy hết mình bạn ơi!`
    ];

    const randomGreeting = genzGreetings[Math.floor(Math.random() * genzGreetings.length)];

    if (welcomeChannel) {
        setTimeout(() => {
            welcomeChannel.send(randomGreeting).catch(() => null);
        }, 3000); 
    }
});

// ================= BẮT SỰ KIỆN NITRO BOOST VÀ GỬI LỜI CẢM ƠN =================
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    const guildId = newMember.guild.id;
    const targetChannelId = boostChannelsDatabase.get(guildId);
    
    if (!targetChannelId) return;

    if (!oldMember.premiumSince && newMember.premiumSince) {
        setTimeout(() => {
            const targetChannel = newMember.guild.channels.cache.get(targetChannelId);
            if (!targetChannel) return;

            const genzBoostThanks = [
                `Chúng tôi vô cùng trân trọng hành động này của bạn, server chính thức tăng thêm công lực rồi.`,
                `Đúng là không làm chúng tôi thất vọng, cảm ơn bạn vì lượt boost chất lượng này.`,
                `Chúng tôi ghi nhận độ đẹp trai chịu chơi này của bạn, server phát sáng luôn rồi.`,
                `Hành động boost này của bạn quá uy tín, chúng tôi trân trọng sự ủng hộ này rất nhiều.`,
                `Chúng tôi gửi lời cảm ơn đến bạn vì đã tiếp thêm năng lượng tối thượng cho server.`,
                `Chúng tôi thực sự nể phục độ chịu chơi của bạn, cảm ơn bạn vì viên kim cương này nha.`,
                `Vibe này quá là đẳng cấp rồi, chúng tôi cảm ơn bạn vì đã tin tưởng và nâng cấp server.`,
                `Chúng tôi chốt đơn bạn là thành viên VIP nhất hôm nay, cảm ơn vì cú boost đỉnh chóp.`,
                `Chúng tôi biết ơn bạn rất nhiều khi đã đầu tư Nitro giúp server ngày càng lớn mạnh.`,
                `Độ hào phóng của bạn làm chúng tôi nể phục thực sự, cảm ơn bạn vì lượt ủng hộ này.`,
                `Chúng tôi ghi nhận tấm lòng của bạn, server chuẩn bị bay lên một tầm cao mới nhờ bạn đó.`,
                `Chúng tôi gửi ngàn lời cảm ơn đến bạn, hành động này của bạn thực sự quá slay.`,
                `Chúng tôi trân trọng bạn rất nhiều, cú boost này đã giúp server mở khóa thêm tính năng mới.`,
                `Chúng tôi vô cùng hạnh phúc khi nhận được sự hậu thuẫn xịn sò này từ bạn.`,
                `Đúng là hạt nhài cứu rỗi server, chúng tôi cảm ơn bạn vì quyết định chốt đơn boost này.`
            ];

            const randomThanks = genzBoostThanks[Math.floor(Math.random() * genzBoostThanks.length)];
            
            const ticketChannelId = boostTicketChannelsDatabase.get(guildId);
            let ticketNotice = '';
            
            if (ticketChannelId) {
                ticketNotice = `\n👉 *Bạn vui lòng tạo ticket tại kênh <#${ticketChannelId}> để nhận role và room nhé!*`;
            } else {
                ticketNotice = `\n👉 *Bạn vui lòng liên hệ Ban Quản Trị hoặc tạo ticket để nhận role và room nhé!*`;
            }

            targetChannel.send(`🤍 Cảm ơn <@${newMember.id}>!\n${randomThanks}${ticketNotice}`).catch(() => null);
        }, 3000);
    }
});

client.login(process.env.DISCORD_TOKEN);