/** Mandarin lexicon (simplified). Level 1 = 1–2 characters, 2 = short phrase, 3 = sentence. Pinyin with tone marks. */
import { makeVocab, type Vocab } from "./vocab";

const v = (theme: Vocab["theme"], level: 1 | 2 | 3, text: string, reading: string, en: string, focus?: string): Vocab => makeVocab("zh", theme, level, text, en, reading, focus);

export const vocabZh: Vocab[] = [
  // nature
  v("nature", 1, "火", "huǒ", "fire", "3rd tone dips then rises"), v("nature", 1, "水", "shuǐ", "water", "retroflex sh, 3rd tone"), v("nature", 1, "风", "fēng", "wind", "flat 1st tone"),
  v("nature", 1, "山", "shān", "mountain", "retroflex sh"), v("nature", 1, "河", "hé", "river", "2nd tone rises"), v("nature", 1, "树", "shù", "tree", "4th tone falls sharply"),
  v("nature", 1, "石头", "shítou", "stone", "neutral tone on 头"), v("nature", 1, "天空", "tiānkōng", "sky", "two 1st tones, keep both high"), v("nature", 1, "森林", "sēnlín", "forest", "s not sh"),
  v("nature", 2, "河水很深", "héshuǐ hěn shēn", "the river is deep", "两个 3rd tones: hěn becomes rising"), v("nature", 2, "高高的山", "gāogāo de shān", "the tall mountain"), v("nature", 2, "一棵大树", "yì kē dà shù", "a big tree", "一 changes to 4th tone before kē"),
  v("nature", 3, "风从山上吹下来", "fēng cóng shān shàng chuī xiàlái", "the wind blows down from the mountain"), v("nature", 3, "森林里很安静", "sēnlín lǐ hěn ānjìng", "it is quiet in the forest"), v("nature", 3, "石头掉进了河里", "shítou diào jìn le hé lǐ", "the stone fell into the river"),
  // weather
  v("weather", 1, "太阳", "tàiyáng", "sun"), v("weather", 1, "雨", "yǔ", "rain", "ü with rounded lips"), v("weather", 1, "雪", "xuě", "snow", "x is soft, ü vowel"), v("weather", 1, "云", "yún", "cloud", "ü vowel"),
  v("weather", 1, "雷", "léi", "thunder"), v("weather", 1, "冰", "bīng", "ice", "unaspirated b"), v("weather", 1, "雾", "wù", "fog"), v("weather", 1, "闪电", "shǎndiàn", "lightning"),
  v("weather", 2, "下雨了", "xià yǔ le", "it's raining", "neutral 了"), v("weather", 2, "今天很冷", "jīntiān hěn lěng", "it's cold today"), v("weather", 2, "冬天的太阳", "dōngtiān de tàiyáng", "the winter sun"),
  v("weather", 3, "明天可能会下雨", "míngtiān kěnéng huì xià yǔ", "it may rain tomorrow"), v("weather", 3, "今晚有大风", "jīnwǎn yǒu dà fēng", "there's strong wind tonight"), v("weather", 3, "雾盖住了整个山谷", "wù gài zhù le zhěnggè shāngǔ", "fog covered the whole valley"),
  // animals
  v("animals", 1, "狼", "láng", "wolf"), v("animals", 1, "猫", "māo", "cat"), v("animals", 1, "狗", "gǒu", "dog"), v("animals", 1, "鸟", "niǎo", "bird"),
  v("animals", 1, "蛇", "shé", "snake", "retroflex sh"), v("animals", 1, "马", "mǎ", "horse", "3rd tone; mā/má/mà are other words"), v("animals", 1, "龙", "lóng", "dragon"), v("animals", 1, "熊", "xióng", "bear", "x not sh"),
  v("animals", 2, "黑色的狼", "hēisè de láng", "the black wolf"), v("animals", 2, "一只老猫", "yì zhī lǎo māo", "an old cat", "zh retroflex"), v("animals", 2, "龙在睡觉", "lóng zài shuìjiào", "the dragon is sleeping"),
  v("animals", 3, "狗在田里跑", "gǒu zài tián lǐ pǎo", "the dog runs in the field"), v("animals", 3, "蛇在太阳下睡觉", "shé zài tàiyáng xià shuìjiào", "the snake sleeps in the sun"), v("animals", 3, "鸟儿在早上唱歌", "niǎor zài zǎoshang chànggē", "birds sing in the morning", "儿 erhua"),
  // body
  v("body", 1, "手", "shǒu", "hand"), v("body", 1, "眼睛", "yǎnjing", "eye", "neutral tone on 睛"), v("body", 1, "心", "xīn", "heart"), v("body", 1, "血", "xuè", "blood", "ü vowel"),
  v("body", 1, "骨头", "gǔtou", "bone", "neutral 头"), v("body", 1, "头", "tóu", "head"), v("body", 1, "嘴", "zuǐ", "mouth", "z not zh"), v("body", 1, "脚", "jiǎo", "foot"),
  v("body", 2, "红色的眼睛", "hóngsè de yǎnjing", "red eyes"), v("body", 2, "我的心在跳", "wǒ de xīn zài tiào", "my heart is beating"), v("body", 2, "冰冷的手", "bīnglěng de shǒu", "icy hands"),
  v("body", 3, "我的头很疼", "wǒ de tóu hěn téng", "my head hurts"), v("body", 3, "闭上眼睛深呼吸", "bì shàng yǎnjing shēn hūxī", "close your eyes and breathe deeply"), v("body", 3, "血在我身体里流", "xuè zài wǒ shēntǐ lǐ liú", "blood flows through my body"),
  // food
  v("food", 1, "饭", "fàn", "rice / meal"), v("food", 1, "盐", "yán", "salt"), v("food", 1, "蜂蜜", "fēngmì", "honey"), v("food", 1, "茶", "chá", "tea", "aspirated ch"),
  v("food", 1, "肉", "ròu", "meat", "r is like a soft zh"), v("food", 1, "水果", "shuǐguǒ", "fruit", "two 3rd tones"), v("food", 1, "牛奶", "niúnǎi", "milk"), v("food", 1, "鸡蛋", "jīdàn", "egg"),
  v("food", 2, "一杯水", "yì bēi shuǐ", "a glass of water"), v("food", 2, "热汤", "rè tāng", "hot soup"), v("food", 2, "太咸了", "tài xián le", "too salty"),
  v("food", 3, "我想吃热的东西", "wǒ xiǎng chī rè de dōngxi", "I want to eat something hot", "chī retroflex, neutral 西"), v("food", 3, "这个汤太咸了", "zhège tāng tài xián le", "this soup is too salty"), v("food", 3, "面包是刚做的", "miànbāo shì gāng zuò de", "the bread was just made"),
  // emotions
  v("emotions", 1, "害怕", "hàipà", "fear", "aspirated p"), v("emotions", 1, "生气", "shēngqì", "anger"), v("emotions", 1, "快乐", "kuàilè", "joy"), v("emotions", 1, "痛", "tòng", "pain"),
  v("emotions", 1, "希望", "xīwàng", "hope"), v("emotions", 1, "恨", "hèn", "hatred"), v("emotions", 1, "平静", "píngjìng", "calm"), v("emotions", 1, "梦", "mèng", "dream"),
  v("emotions", 2, "不要害怕", "búyào hàipà", "don't be afraid", "不 becomes 2nd tone before 4th"), v("emotions", 2, "很生气", "hěn shēngqì", "very angry"), v("emotions", 2, "一点希望", "yìdiǎn xīwàng", "a little hope"),
  v("emotions", 3, "我不怕你", "wǒ bú pà nǐ", "I'm not afraid of you", "不 sandhi"), v("emotions", 3, "希望永远不会死", "xīwàng yǒngyuǎn bú huì sǐ", "hope never dies"), v("emotions", 3, "痛会过去的", "tòng huì guòqù de", "the pain will pass"),
  // time
  v("time", 1, "夜晚", "yèwǎn", "night"), v("time", 1, "白天", "báitiān", "daytime"), v("time", 1, "小时", "xiǎoshí", "hour"), v("time", 1, "明天", "míngtiān", "tomorrow"),
  v("time", 1, "晚", "wǎn", "late / evening"), v("time", 1, "总是", "zǒngshì", "always"), v("time", 1, "从不", "cóngbù", "never"), v("time", 1, "现在", "xiànzài", "now"),
  v("time", 2, "今天晚上", "jīntiān wǎnshang", "tonight", "neutral 上"), v("time", 2, "每天早上", "měitiān zǎoshang", "every morning"), v("time", 2, "现在或从不", "xiànzài huò cóngbù", "now or never"),
  v("time", 3, "夜晚又长又冷", "yèwǎn yòu cháng yòu lěng", "the night is long and cold"), v("time", 3, "你总是来晚", "nǐ zǒngshì lái wǎn", "you always come late"), v("time", 3, "时间不多了", "shíjiān bù duō le", "there isn't much time left"),
  // places
  v("places", 1, "家", "jiā", "home"), v("places", 1, "门", "mén", "door"), v("places", 1, "路", "lù", "road"), v("places", 1, "城市", "chéngshì", "city", "ch then sh, both retroflex"),
  v("places", 1, "桥", "qiáo", "bridge", "q like 'ch' with spread lips"), v("places", 1, "塔", "tǎ", "tower"), v("places", 1, "山洞", "shāndòng", "cave"), v("places", 1, "市场", "shìchǎng", "market"),
  v("places", 2, "关着的门", "guān zhe de mén", "the closed door"), v("places", 2, "很长的路", "hěn cháng de lù", "a long road"), v("places", 2, "在山洞里", "zài shāndòng lǐ", "inside the cave"),
  v("places", 3, "塔今晚会倒", "tǎ jīnwǎn huì dǎo", "the tower will fall tonight"), v("places", 3, "我们早点去市场", "wǒmen zǎodiǎn qù shìchǎng", "let's go to the market early"), v("places", 3, "桥在河上", "qiáo zài hé shàng", "the bridge is over the river"),
  // actions
  v("actions", 1, "跑", "pǎo", "to run", "aspirated p"), v("actions", 1, "跳", "tiào", "to jump"), v("actions", 1, "打破", "dǎpò", "to break"), v("actions", 1, "烧", "shāo", "to burn"),
  v("actions", 1, "睡觉", "shuìjiào", "to sleep"), v("actions", 1, "喊", "hǎn", "to shout"), v("actions", 1, "飞", "fēi", "to fly"), v("actions", 1, "躲", "duǒ", "to hide"),
  v("actions", 2, "烧掉一切", "shāo diào yíqiè", "burn everything"), v("actions", 2, "现在跳", "xiànzài tiào", "jump now"), v("actions", 2, "别躲", "bié duǒ", "don't hide"),
  v("actions", 3, "打破那扇铁门", "dǎpò nà shàn tiěmén", "break that iron door"), v("actions", 3, "你不能躲在这里", "nǐ bù néng duǒ zài zhèlǐ", "you can't hide here"), v("actions", 3, "对着天空喊我的名字", "duì zhe tiānkōng hǎn wǒ de míngzi", "shout my name at the sky"),
  // light
  v("light", 1, "光", "guāng", "light"), v("light", 1, "影子", "yǐngzi", "shadow", "neutral 子"), v("light", 1, "红", "hóng", "red"), v("light", 1, "黑", "hēi", "black"),
  v("light", 1, "白", "bái", "white"), v("light", 1, "金", "jīn", "gold"), v("light", 1, "银", "yín", "silver"), v("light", 1, "亮", "liàng", "bright"),
  v("light", 2, "金色的光", "jīnsè de guāng", "golden light"), v("light", 2, "冷冷的影子", "lěnglěng de yǐngzi", "a cold shadow"), v("light", 2, "一道银光", "yí dào yín guāng", "a flash of silver light"),
  v("light", 3, "光打破了影子", "guāng dǎpò le yǐngzi", "the light broke the shadow"), v("light", 3, "金子在黑暗里发光", "jīnzi zài hēi'àn lǐ fāguāng", "gold shines in the dark"), v("light", 3, "没有东西能逃出影子", "méiyǒu dōngxi néng táo chū yǐngzi", "nothing can escape the shadow"),
  // numbers
  v("numbers", 1, "一", "yī", "one"), v("numbers", 1, "二", "èr", "two", "er sound, 4th tone"), v("numbers", 1, "三", "sān", "three"), v("numbers", 1, "五", "wǔ", "five"),
  v("numbers", 1, "十", "shí", "ten", "retroflex sh"), v("numbers", 1, "一百", "yìbǎi", "one hundred"), v("numbers", 1, "一千", "yìqiān", "one thousand"), v("numbers", 1, "第一", "dìyī", "first"),
  v("numbers", 2, "两次", "liǎng cì", "twice", "c is like 'ts'"), v("numbers", 2, "一百年", "yìbǎi nián", "a hundred years"), v("numbers", 2, "五月一号", "wǔ yuè yī hào", "the first of May"),
  v("numbers", 3, "我有三个兄弟", "wǒ yǒu sān gè xiōngdì", "I have three brothers"), v("numbers", 3, "天上有一千颗星星", "tiān shàng yǒu yìqiān kē xīngxing", "there are a thousand stars in the sky"), v("numbers", 3, "钟响了三次", "zhōng xiǎng le sān cì", "the bell rang three times"),
  // objects
  v("objects", 1, "剑", "jiàn", "sword"), v("objects", 1, "盾", "dùn", "shield"), v("objects", 1, "钥匙", "yàoshi", "key", "neutral 匙"), v("objects", 1, "书", "shū", "book"),
  v("objects", 1, "绳子", "shéngzi", "rope"), v("objects", 1, "钟", "zhōng", "bell"), v("objects", 1, "镜子", "jìngzi", "mirror"), v("objects", 1, "蜡烛", "làzhú", "candle"),
  v("objects", 2, "旧钥匙", "jiù yàoshi", "the old key"), v("objects", 2, "我断了的剑", "wǒ duàn le de jiàn", "my broken sword"), v("objects", 2, "点着的蜡烛", "diǎn zhe de làzhú", "a lit candle"),
  v("objects", 3, "这本书藏着一个秘密", "zhè běn shū cáng zhe yí gè mìmì", "this book hides a secret"), v("objects", 3, "镜子不会说谎", "jìngzi bú huì shuōhuǎng", "the mirror doesn't lie"), v("objects", 3, "绳子断了", "shéngzi duàn le", "the rope snapped"),
];
