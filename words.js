// Word bank grouped by category. Add as many as you like.
// Multi-word entries are fine - the chat filter blocks every significant part.

const WORD_DATA = {
  "Animals": [
    "dog", "cat", "elephant", "penguin", "kangaroo", "dolphin", "octopus",
    "giraffe", "hedgehog", "crocodile", "butterfly", "squirrel", "rhinoceros",
    "flamingo", "jellyfish", "chameleon", "walrus", "panda", "owl", "bat"
  ],
  "Food & Drink": [
    "pizza", "spaghetti", "pancake", "ice cream", "sushi", "popcorn",
    "hamburger", "avocado", "doughnut", "smoothie", "cereal", "pickle",
    "garlic bread", "marshmallow", "coffee", "watermelon", "taco",
    "cheesecake", "lemonade", "bacon"
  ],
  "Around the House": [
    "pillow", "staircase", "doorbell", "curtain", "mattress", "vacuum cleaner",
    "light switch", "dishwasher", "wardrobe", "chimney", "floorboard",
    "coat hanger", "welcome mat", "ceiling fan", "laundry basket", "mirror",
    "radiator", "bookshelf", "spare key", "toilet brush"
  ],
  "Sports & Games": [
    "basketball", "tennis", "bowling", "chess", "skateboard", "boxing",
    "surfing", "dodgeball", "marathon", "golf", "hockey", "darts",
    "hopscotch", "arm wrestling", "hide and seek", "ping pong",
    "rock climbing", "scuba diving", "figure skating", "tug of war"
  ],
  "Nature & Outdoors": [
    "waterfall", "volcano", "rainbow", "glacier", "cactus", "thunderstorm",
    "canyon", "coral reef", "quicksand", "campfire", "avalanche", "sand dune",
    "hot spring", "tornado", "moss", "tide pool", "meteor", "fog",
    "seashell", "tree stump"
  ],
  "Jobs & Professions": [
    "firefighter", "plumber", "astronaut", "teacher", "chef", "lifeguard",
    "electrician", "librarian", "dentist", "farmer", "journalist", "tour guide",
    "referee", "beekeeper", "surgeon", "mechanic", "barista",
    "lighthouse keeper", "magician", "detective"
  ],
  "Technology": [
    "keyboard", "headphones", "smartphone", "drone", "router", "usb stick",
    "webcam", "power bank", "touchscreen", "hard drive", "qr code",
    "smartwatch", "printer", "remote control", "charging cable", "microphone",
    "speaker", "hologram", "robot vacuum", "video call"
  ],
  "Travel & Places": [
    "airport", "lighthouse", "museum", "subway", "hostel", "passport",
    "roller coaster", "camping tent", "ski resort", "cruise ship", "souvenir",
    "border crossing", "luggage carousel", "road trip", "hot air balloon",
    "castle", "market stall", "beach umbrella", "mountain trail", "train station"
  ],
  "Movies & TV": [
    "popcorn bucket", "red carpet", "plot twist", "superhero", "zombie",
    "spaceship", "car chase", "movie trailer", "sound effect", "stunt double",
    "end credits", "horror film", "cartoon", "documentary", "talk show",
    "game show", "live audience", "movie poster", "sequel", "cliffhanger"
  ],
  "Music": [
    "guitar", "drum kit", "trumpet", "sheet music", "orchestra", "playlist",
    "saxophone", "karaoke", "choir", "vinyl record", "music festival",
    "air guitar", "conductor", "ringtone", "marching band", "lullaby",
    "beatbox", "violin", "dj booth", "encore"
  ],
  "Clothing": [
    "raincoat", "flip flops", "bow tie", "mittens", "hoodie", "top hat",
    "shoelace", "sunglasses", "backpack", "scarf", "denim jacket", "swimsuit",
    "pyjamas", "high heels", "baseball cap", "apron", "onesie", "wristwatch",
    "belt", "gloves"
  ],
  "Body & Health": [
    "sneeze", "hiccup", "sunburn", "bandage", "yawn", "goosebumps", "blister",
    "heartbeat", "headache", "stretch", "sweat", "eyebrow", "funny bone",
    "muscle", "ticklish", "thumb", "freckle", "snore", "wink", "shiver"
  ],
  "School & Office": [
    "whiteboard", "stapler", "homework", "calculator", "lunchbox", "detention",
    "report card", "glue stick", "spelling test", "recess", "pencil sharpener",
    "name tag", "group project", "hole punch", "sticky note", "chalk",
    "field trip", "alarm clock", "paper clip", "highlighter"
  ],
  "Emotions & Actions": [
    "laughing", "whisper", "tiptoe", "panic", "celebrate", "sulk", "daydream",
    "flinch", "cringe", "applause", "eavesdrop", "procrastinate", "high five",
    "facepalm", "blush", "gossip", "tantrum", "nod", "sigh", "juggle"
  ],
  "Fantasy & Myth": [
    "dragon", "wizard", "mermaid", "unicorn", "vampire", "ghost", "werewolf",
    "genie", "troll", "fairy", "giant", "crystal ball", "magic wand",
    "haunted house", "sea monster", "pot of gold", "spell book",
    "flying carpet", "dwarf", "phoenix"
  ],
  "Vehicles": [
    "submarine", "helicopter", "tractor", "bicycle", "ambulance", "hot rod",
    "monster truck", "canoe", "forklift", "cable car", "jet ski", "hovercraft",
    "tank", "unicycle", "snowplough", "tow truck", "sailboat", "scooter",
    "double decker bus", "race car"
  ],
  "Kitchen": [
    "frying pan", "rolling pin", "cheese grater", "kettle", "oven mitt",
    "blender", "ladle", "corkscrew", "toaster", "whisk", "cutting board",
    "measuring cup", "garlic press", "tea towel", "spatula", "colander",
    "ice cube tray", "pepper mill", "can opener", "dish rack"
  ],
  "Weather & Sky": [
    "lightning", "snowflake", "heatwave", "drizzle", "hailstone", "sunrise",
    "full moon", "shooting star", "sunbeam", "frost", "puddle", "humidity",
    "gust of wind", "eclipse", "aurora", "cloudburst", "sleet", "mirage",
    "twilight", "rainstorm"
  ],
  "Hobbies": [
    "knitting", "gardening", "birdwatching", "pottery", "origami", "fishing",
    "stamp collecting", "baking", "photography", "painting", "chess club",
    "jigsaw puzzle", "hiking", "camping", "juggling", "calligraphy",
    "model building", "scrapbooking", "yoga", "geocaching"
  ],
  "Everyday Objects": [
    "umbrella", "stapler", "wheelbarrow", "clothes peg", "shopping trolley",
    "traffic cone", "fire extinguisher", "park bench", "vending machine",
    "revolving door", "shopping list", "piggy bank", "rubber duck",
    "magnifying glass", "trampoline", "hammock", "kite", "yo-yo",
    "bubble wrap", "snow globe"
  ]
};

module.exports = WORD_DATA;
