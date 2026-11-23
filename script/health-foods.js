// Approximate reference calories, not a laboratory database.
// Each entry is for the specific portion shown. Users can override any value.
export const FOODS=[
 ["Egg, large","1 egg",72],["Bacon, cooked","1 slice",43],
 ["Salmon, baked","3 oz (85 g)",175],["Chicken breast, cooked","3 oz (85 g)",128],
 ["Turkey breast, cooked","3 oz (85 g)",125],["Lean beef, cooked","3 oz (85 g)",180],
 ["Tofu, firm","3 oz (85 g)",75],["Canned tuna in water","3 oz (85 g)",73],
 ["White potato, baked","1 medium",161],["Sweet potato, baked","1 medium",112],
 ["Broccoli, steamed","1 cup",55],["Peppers and onions","1 cup",55],
 ["Corn, cooked","1 cup",143],["Green beans, cooked","1 cup",44],
 ["Baby carrots","1 cup",50],["Apple","1 medium",95],["Banana","1 medium",105],
 ["Strawberries","1 cup",49],["Orange","1 medium",62],
 ["Greek yogurt, plain nonfat","3/4 cup",100],["Milk, 2%","1 cup",122],
 ["Cheddar cheese","1 oz (28 g)",115],["Cottage cheese, low fat","1/2 cup",90],
 ["Bread, white","1 slice",80],["Oatmeal, cooked","1 cup",154],
 ["White rice, cooked","1 cup",205],["Pasta, cooked","1 cup",200],
 ["Peanut butter","1 tbsp",95],["Almonds","1 oz (28 g)",164],
 ["Vegetable oil","1 tsp",40],["Olive oil","1 tsp",40],
 ["Butter","1 tsp",34],["Honey","1 tbsp",64],
 ["Cornbread","1 piece (approx. 60 g)",200],
 ["Ramen noodles, dry packaged","1 package (varies)",380],
 ["Pizza, cheese","1 medium slice",250],["French fries","1 small order",230],
 ["Pickle, dill","1 medium",5],["Water","1 cup",0]
].map(([name,portion,calories])=>({name,portion,calories}));
export function searchFoods(term){
 const q=String(term||"").trim().toLocaleLowerCase();
 if(!q)return FOODS.slice(0,12);
 return FOODS.filter(food=>
   food.name.toLocaleLowerCase().includes(q)||food.portion.toLocaleLowerCase().includes(q)
 ).slice(0,24);
}
