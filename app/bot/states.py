from aiogram.fsm.state import State, StatesGroup

class AdminConfigState(StatesGroup):
    waiting_mono_url = State()
    waiting_card_number = State()
    waiting_welcome_text = State()
    waiting_broadcast_message = State()

class FeedbackState(StatesGroup):
    waiting_message = State()